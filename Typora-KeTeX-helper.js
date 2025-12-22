console.log("Typora LaTeX AutoComplete Helper Loaded");
const LatexAutoCompleter = {
    configUrl: new URL('./latex-commands.json', document.currentScript.src).href,
    commands: [],

    timer: null,

    init: function() {
        this.loadCommands(); // 初始化时先加载数据
        const checkLoaded = setInterval(() => {
            if (window.File && window.File.editor && window.jQuery) {
                clearInterval(checkLoaded);
                this.injectStyle();
                this.start();
            }
        }, 500);
    },

    loadCommands: async function() {
        try {
            const res = await fetch(this.configUrl, { cache: 'no-cache' });
            if (!res.ok) throw new Error(res.statusText);
            this.commands = await res.json();
            console.log("LatexAutoCompleter: Commands loaded from JSON.");
        } catch (e) {
            console.error("Failed to load LaTeX commands:", e);
            this.commands = [{ key: "\\error", hint: "加载配置失败", snippet: "", offset: 0 }];
        }
    },

    injectStyle: function() {
        if (document.getElementById('latex-autocomplete-style')) return;
        const style = document.createElement('style');
        style.id = 'latex-autocomplete-style';
        style.innerHTML = `
            .auto-suggest-container {
                z-index: 999999 !important; 
                margin-top: 45px !important; 
                box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
            }
            .plugin-latex-item {
                display: flex;
                justify-content: space-between;
                padding: 4px 10px;
                min-width: 160px;
                cursor: pointer;
            }
            .plugin-latex-item.active {
                background-color: #2483ff !important;
                color: white !important;
            }
            .plugin-latex-item .cmd { font-family: monospace; font-weight: bold; }
            .plugin-latex-item .hint { opacity: 0.8; font-size: 0.8em; }
        `;
        document.head.appendChild(style);
    },

    start: function() {
        this.$ = window.jQuery;
        document.addEventListener("input", (e) => {
            if (this.timer) clearTimeout(this.timer);
            this.timer = setTimeout(() => this.onInput(e), 150);
        });
    },

    onInput: function(e) {
        const range = File.editor.selection.getRangy();
        if (!range || !range.collapsed) return;

        const container = this.$(range.startContainer).closest('[md-inline="math"], [type="math/tex"], .md-math-block');
        if (container.length === 0) return;

        const node = container[0];
        const bookmark = range.getBookmark(node);
        
        range.setStartBefore(node);
        const textBefore = range.toString();
        range.moveToBookmark(bookmark);

        const match = textBefore.match(/\\[a-zA-Z]*$/);
        if (!match) return;

        const inputKeyword = match[0];
        const candidates = this.commands.filter(cmd => cmd.key.startsWith(inputKeyword));
        
        if (candidates.length === 0) return;

        // 重新设置锚点，确保覆盖用户输入的字符
        bookmark.start -= inputKeyword.length;

        this.showAutoComplete(candidates, bookmark, inputKeyword);
    },

    showAutoComplete: function(candidates, bookmark, inputKeyword) {
        const callbacks = {
            render: (item, isActive) => {
                const activeClass = isActive ? "active" : "";
                return `
                    <li class="plugin-latex-item ${activeClass}" data-content="${item.key}">
                        <span class="cmd">${item.key}</span>
                        <span class="hint">${item.hint}</span>
                    </li>
                `;
            },
            search: (term) => this.commands.filter(c => c.key.startsWith(term)),
            
            beforeApply: (item) => {
                const cmd = (typeof item === 'string') ? this.commands.find(c => c.key === item) : item;
                if (!cmd) return "";

                // 核心修复：手动清除选区内的旧文本
                // 由于我们在 show 时传入了修改过的 bookmark，
                // 此时 File.editor.autoComplete.state.anchor 已经锁定了要替换的范围
                const anchor = File.editor.autoComplete.state.anchor;
                if (anchor) {
                    const r = File.editor.selection.getRangy();
                    const textNode = anchor.containerNode.firstChild || anchor.containerNode;
                    r.setStart(textNode, anchor.start);
                    r.setEnd(textNode, anchor.end);
                    File.editor.selection.setRange(r, true);
                    // 执行删除动作
                    File.editor.UserOp.pasteHandler(File.editor, "", true);
                }

                // 插入新 Snippet
                this.applySnippet(cmd);

                return ""; // 阻止默认插入
            }
        };

        File.editor.autoComplete.attachToRange();
        File.editor.autoComplete.show(candidates, bookmark, inputKeyword, callbacks);
    },

    applySnippet: function(cmd) {
        // 1. 插入 Snippet
        File.editor.UserOp.pasteHandler(File.editor, cmd.snippet, true);

        // 2. 处理光标跳转
        if (cmd.offset && cmd.offset !== 0) {
            setTimeout(() => {
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    // 利用 Range.setStart / setEnd 移动光标
                    // 这里的 offset 是相对于当前插入后位置的偏移
                    const newOffset = range.startOffset + cmd.offset;
                    
                    // 确保偏移不越界
                    if (newOffset >= 0) {
                        range.setStart(range.startContainer, newOffset);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                        
                        // 告知 Typora 选区已变更
                        File.editor.selection.scrollAdjust();
                    }
                }
            }, 50);
        }
    }
};

LatexAutoCompleter.init();