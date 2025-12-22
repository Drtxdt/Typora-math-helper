console.log("Typora-math-helper Loaded");
const LatexAutoCompleter = {
    configUrl: new URL('./latex-commands.json', document.currentScript.src).href,
    commands: [],

    timer: null,
    currentAutoCompleteContainer: null,  // 跟踪当前的补全容器
    currentAutoCompleteKeyboardHandler: null,  // 跟踪当前的键盘处理器
    suppressNextInput: false,  // 标志：忽略下一次 input 事件

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
            console.log("Typora-math-helper: Commands loaded from JSON.");
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
            // 如果标记了忽略下一次 input，则跳过
            if (this.suppressNextInput) {
                this.suppressNextInput = false;
                return;
            }
            
            // 销毁旧的补全UI（如果存在）
            this.hideAutoComplete();
            
            if (this.timer) clearTimeout(this.timer);
            this.timer = setTimeout(() => this.onInput(e), 150);
        });
    },

    hideAutoComplete: function() {
        if (this.currentAutoCompleteContainer && document.body.contains(this.currentAutoCompleteContainer)) {
            document.body.removeChild(this.currentAutoCompleteContainer);
            this.currentAutoCompleteContainer = null;
        }
        if (this.currentAutoCompleteKeyboardHandler) {
            document.removeEventListener('keydown', this.currentAutoCompleteKeyboardHandler, true);
            this.currentAutoCompleteKeyboardHandler = null;
        }
    },

    getMatrixEditorContent: function() {
        // 处理 CodeMirror 编辑器（块级公式）
        if (window.matrix && window.matrix.widgetNode && window.matrix.editor) {
            const cmEditor = window.matrix.editor;
            if (cmEditor.getValue) {
                const content = cmEditor.getValue();
                return {
                    type: 'codemirror',
                    content: content,
                    editor: cmEditor
                };
            }
        }
        return null;
    },

    onInput: function(e) {
        const range = File.editor.selection.getRangy();
        if (!range || !range.collapsed) {
            return;
        }

        // 尝试从 CodeMirror 编辑器获取内容（块级公式）
        const cmContent = this.getMatrixEditorContent();
        if (cmContent) {
            return this.onInputCodeMirror(cmContent);
        }

        // 处理块级公式：检查事件目标是否在块内
        const mathBlock = this.$(e.target).closest('.md-math-block');
        if (mathBlock.length > 0) {
            return this.onInputMathBlock(e.target, mathBlock[0]);
        }

        // 处理内联公式
        const container = this.$(range.startContainer).closest('[md-inline="math"], [type="math/tex"], .md-math-block');
        if (container.length === 0) {
            return;
        }

        const node = container[0];
        const bookmark = range.getBookmark(node);
        
        range.setStartBefore(node);
        const textBefore = range.toString();
        range.moveToBookmark(bookmark);
        
        const match = textBefore.match(/\\[a-zA-Z]*$/);
        if (!match) {
            return;
        }

        const inputKeyword = match[0];
        const candidates = this.commands.filter(cmd => cmd.key.startsWith(inputKeyword));
        
        if (candidates.length === 0) return;

        // 重新设置锚点，确保覆盖用户输入的字符
        bookmark.start -= inputKeyword.length;

        this.showAutoComplete(candidates, bookmark, inputKeyword, 'inline');
    },

    onInputMathBlock: function(target, mathBlock) {
        
        // 获取块内的文本内容（不需要精确的节点追踪）
        const treeWalker = document.createTreeWalker(
            mathBlock,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let fullText = '';
        let node;
        let insideMath = false;
        
        while (node = treeWalker.nextNode()) {
            const text = node.textContent;
            
            // 检查是否在 $$ 内
            if (text.includes('$$')) {
                insideMath = !insideMath;
                if (!insideMath) break; // 离开数学块
                // 提取 $$ 之后的内容
                const parts = text.split('$$');
                fullText += parts[parts.length - 1];
            } else if (insideMath) {
                fullText += text;
            }
        }
        
        // 清理末尾空白用于匹配
        const trimmedForMatch = fullText.trim();
        
        // 匹配末尾的 LaTeX 命令
        const match = trimmedForMatch.match(/\\[a-zA-Z]*$/);
        if (!match) {
            return;
        }

        const inputKeyword = match[0];
        const candidates = this.commands.filter(cmd => cmd.key.startsWith(inputKeyword));
        
        if (candidates.length === 0) {
            return;
        }

        this.showAutoComplete(candidates, {}, inputKeyword, 'mathblock', { 
            target, 
            mathBlock, 
            inputKeyword
        });
    },

    onInputCodeMirror: function(cmContent) {
        const editor = cmContent.editor;
        const content = cmContent.content;
        const cursor = editor.getCursor();
        const line = content.split('\n')[cursor.line] || '';
        const ch = cursor.ch;

        // 获取光标前的内容
        const textBefore = line.substring(0, ch);
        
        const match = textBefore.match(/\\[a-zA-Z]*$/);
        if (!match) {
            return;
        }

        const inputKeyword = match[0];
        const candidates = this.commands.filter(cmd => cmd.key.startsWith(inputKeyword));
        
        if (candidates.length === 0) return;

        // 创建虚拟 bookmark 以供 showAutoComplete 使用
        const bookmark = {
            start: ch - inputKeyword.length,
            end: ch,
            containerNode: null,  // CodeMirror 模式下不需要
            collapsed: true
        };

        this.showAutoComplete(candidates, bookmark, inputKeyword, 'codemirror', editor);
    },

    showAutoComplete: function(candidates, bookmark, inputKeyword, type = 'inline', cmEditor = null) {
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
                if (!cmd) {
                    return "";
                }

                if (type === 'codemirror') {
                    // 处理 CodeMirror 编辑器（块级公式）
                    this.applySnippetCodeMirror(cmd, cmEditor, inputKeyword);
                } else if (type === 'mathblock') {
                    // 处理块级公式
                    this.applySnippetMathBlock(cmd, cmEditor, inputKeyword);
                } else {
                    // 处理内联公式
                    this.applySnippetInline(cmd, inputKeyword);
                }

                return ""; // 阻止默认插入
            }
        };

        if (type === 'codemirror') {
            // CodeMirror 模式下，不通过 File.editor.autoComplete，而是直接显示建议
            this.showAutoCompleteForCodeMirror(candidates, cmEditor, inputKeyword, callbacks);
        } else if (type === 'mathblock') {
            // 块级公式模式
            this.showAutoCompleteForMathBlock(candidates, cmEditor, inputKeyword, callbacks);
        } else {
            // 内联公式：使用自定义补全菜单，显示所有候选项
            this.showAutoCompleteForInline(candidates, bookmark, inputKeyword, callbacks);
        }
    },

    showAutoCompleteForInline: function(candidates, bookmark, inputKeyword, callbacks) {
        // 为内联公式创建自定义补全菜单，显示所有候选项
        this.hideAutoComplete();
        
        let selectedIndex = 0;

        const container = document.createElement('div');
        container.className = 'latex-autocomplete-container';
        container.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 999999;
            min-width: 200px;
            max-height: 300px;
            overflow-y: auto;
        `;

        const list = document.createElement('ul');
        list.style.cssText = 'list-style: none; margin: 0; padding: 0;';

        candidates.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'plugin-latex-item' + (index === 0 ? ' active' : '');
            li.innerHTML = `
                <span class="cmd">${item.key}</span>
                <span class="hint">${item.hint}</span>
            `;
            li.style.cssText = `
                display: flex;
                justify-content: space-between;
                padding: 4px 10px;
                cursor: pointer;
            `;
            li.addEventListener('click', () => {
                callbacks.beforeApply(item);
                this.hideAutoComplete();
            });
            li.addEventListener('mouseover', () => {
                Array.from(list.children).forEach(child => child.classList.remove('active'));
                li.classList.add('active');
                selectedIndex = index;
            });
            list.appendChild(li);
        });

        container.appendChild(list);
        document.body.appendChild(container);
        
        // 保存容器引用
        this.currentAutoCompleteContainer = container;

        // 定位到当前光标位置（向下偏移以避免 Typora 预览层）
        const range = File.editor.selection.getRangy();
        if (range && range.nativeRange) {
            const rect = range.nativeRange.getBoundingClientRect();
            container.style.left = rect.left + 'px';
            container.style.top = (rect.top + 60) + 'px';
        }

        // 键盘事件处理
        const handleKeydown = (e) => {
            if (!document.body.contains(container)) {
                document.removeEventListener('keydown', handleKeydown, true);
                return;
            }
            
            const isAutoCompleteKey = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key);
            
            if (isAutoCompleteKey) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            switch (e.key) {
                case 'ArrowDown':
                    selectedIndex = (selectedIndex + 1) % candidates.length;
                    Array.from(list.children).forEach((child, idx) => {
                        child.classList.toggle('active', idx === selectedIndex);
                    });
                    return;
                case 'ArrowUp':
                    selectedIndex = (selectedIndex - 1 + candidates.length) % candidates.length;
                    Array.from(list.children).forEach((child, idx) => {
                        child.classList.toggle('active', idx === selectedIndex);
                    });
                    return;
                case 'Enter':
                    const cmd = candidates[selectedIndex];
                    callbacks.beforeApply(cmd);
                    this.hideAutoComplete();
                    return;
                case 'Escape':
                    this.hideAutoComplete();
                    return;
            }
        };

        document.addEventListener('keydown', handleKeydown, true);
        this.currentAutoCompleteKeyboardHandler = handleKeydown;
    },

    showAutoCompleteForCodeMirror: function(candidates, cmEditor, inputKeyword, callbacks) {
        // 创建自定义的自动完成下拉列表（用于 CodeMirror）
        // 销毁旧的补全UI
        this.hideAutoComplete();
        
        let selectedIndex = 0;

        const container = document.createElement('div');
        container.className = 'latex-autocomplete-container';
        container.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 999999;
            min-width: 200px;
            max-height: 300px;
            overflow-y: auto;
        `;

        const list = document.createElement('ul');
        list.style.cssText = 'list-style: none; margin: 0; padding: 0;';

        candidates.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'plugin-latex-item' + (index === 0 ? ' active' : '');
            li.innerHTML = `
                <span class="cmd">${item.key}</span>
                <span class="hint">${item.hint}</span>
            `;
            li.style.cssText = `
                display: flex;
                justify-content: space-between;
                padding: 4px 10px;
                cursor: pointer;
            `;
            li.addEventListener('click', () => {
                const cmd = item;
                callbacks.beforeApply(cmd);
                this.hideAutoComplete();
            });
            li.addEventListener('mouseover', () => {
                Array.from(list.children).forEach(child => child.classList.remove('active'));
                li.classList.add('active');
                selectedIndex = index;
            });
            list.appendChild(li);
        });

        container.appendChild(list);
        document.body.appendChild(container);
        
        // 保存容器引用
        this.currentAutoCompleteContainer = container;

        // 定位到光标位置
        const coords = cmEditor.cursorCoords(true);
        container.style.left = coords.left + 'px';
        container.style.top = (coords.top + 30) + 'px';

        // 键盘事件处理
        const handleKeydown = (e) => {
            if (!document.body.contains(container)) {
                document.removeEventListener('keydown', handleKeydown, true);
                return;
            }
            
            // 检查是否是补全相关的键
            const isAutoCompleteKey = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key);
            
            if (isAutoCompleteKey) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            switch (e.key) {
                case 'ArrowDown':
                    selectedIndex = (selectedIndex + 1) % candidates.length;
                    Array.from(list.children).forEach((child, idx) => {
                        child.classList.toggle('active', idx === selectedIndex);
                    });
                    return;
                case 'ArrowUp':
                    selectedIndex = (selectedIndex - 1 + candidates.length) % candidates.length;
                    Array.from(list.children).forEach((child, idx) => {
                        child.classList.toggle('active', idx === selectedIndex);
                    });
                    return;
                case 'Enter':
                    const cmd = candidates[selectedIndex];
                    callbacks.beforeApply(cmd);
                    this.hideAutoComplete();
                    cmEditor.focus();
                    return;
                case 'Escape':
                    this.hideAutoComplete();
                    cmEditor.focus();
                    return;
            }
        };

        cmEditor.getInputField().addEventListener('keydown', handleKeydown, true);
        this.currentAutoCompleteKeyboardHandler = handleKeydown;
    },

    applySnippetCodeMirror: function(cmd, cmEditor, inputKeyword) {
        // 在 CodeMirror 编辑器中应用 snippet
        const cursor = cmEditor.getCursor();
        const line = cmEditor.getLine(cursor.line);
        
        // 删除已输入的命令关键字
        cmEditor.replaceRange(
            cmd.snippet,
            { line: cursor.line, ch: cursor.ch - inputKeyword.length },
            cursor
        );

        // 处理光标跳转
        if (cmd.offset && cmd.offset !== 0) {
            const newCursor = cmEditor.getCursor();
            cmEditor.setCursor({
                line: newCursor.line,
                ch: Math.max(0, newCursor.ch + cmd.offset)
            });
        }
    },

    showAutoCompleteForMathBlock: function(candidates, data, inputKeyword, callbacks) {
        const { target, mathBlock, fullText } = data;
        
        // 销毁旧的补全UI
        this.hideAutoComplete();
        
        let selectedIndex = 0;

        const container = document.createElement('div');
        container.className = 'latex-autocomplete-container';
        container.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 999999;
            min-width: 200px;
            max-height: 300px;
            overflow-y: auto;
        `;

        const list = document.createElement('ul');
        list.style.cssText = 'list-style: none; margin: 0; padding: 0;';

        candidates.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'plugin-latex-item' + (index === 0 ? ' active' : '');
            li.innerHTML = `
                <span class="cmd">${item.key}</span>
                <span class="hint">${item.hint}</span>
            `;
            li.style.cssText = `
                display: flex;
                justify-content: space-between;
                padding: 4px 10px;
                cursor: pointer;
            `;
            li.addEventListener('click', () => {
                callbacks.beforeApply(item);
                this.hideAutoComplete();
            });
            li.addEventListener('mouseover', () => {
                Array.from(list.children).forEach(child => child.classList.remove('active'));
                li.classList.add('active');
                selectedIndex = index;
            });
            list.appendChild(li);
        });

        container.appendChild(list);
        document.body.appendChild(container);
        
        // 保存容器引用
        this.currentAutoCompleteContainer = container;

        // 定位到光标位置
        const rect = target.getBoundingClientRect();
        container.style.left = (rect.left + 10) + 'px';
        container.style.top = (rect.top + 30) + 'px';

        // 键盘事件处理
        const handleKeydown = (e) => {
            if (!document.body.contains(container)) {
                document.removeEventListener('keydown', handleKeydown, true);
                return;
            }
            
            // 检查是否是补全相关的键
            const isAutoCompleteKey = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key);
            
            if (isAutoCompleteKey) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            switch (e.key) {
                case 'ArrowDown':
                    selectedIndex = (selectedIndex + 1) % candidates.length;
                    Array.from(list.children).forEach((child, idx) => {
                        child.classList.toggle('active', idx === selectedIndex);
                    });
                    return;
                case 'ArrowUp':
                    selectedIndex = (selectedIndex - 1 + candidates.length) % candidates.length;
                    Array.from(list.children).forEach((child, idx) => {
                        child.classList.toggle('active', idx === selectedIndex);
                    });
                    return;
                case 'Enter':
                    const cmd = candidates[selectedIndex];
                    callbacks.beforeApply(cmd);
                    this.hideAutoComplete();
                    return;
                case 'Escape':
                    this.hideAutoComplete();
                    return;
            }
        };

        document.addEventListener('keydown', handleKeydown, true);
        this.currentAutoCompleteKeyboardHandler = handleKeydown;
    },

    applySnippetMathBlock: function(cmd, data, inputKeyword) {
        const { target, mathBlock, inputKeyword: originalKeyword } = data;
        
        // 使用传入的 inputKeyword
        const keyword = originalKeyword || inputKeyword;
        
        try {
            // 新策略：寻找 mathBlock 中的源文本输入框（当处于编辑模式时）
            // Typora 在编辑数学块时会显示源代码编辑器
            
            const sourceInput = mathBlock.querySelector('textarea, input[type="text"], [contenteditable="true"]');
            
            if (sourceInput && sourceInput.tagName === 'TEXTAREA') {
                const textareaValue = sourceInput.value;
                
                const keywordPos = textareaValue.lastIndexOf(keyword);
                
                if (keywordPos < 0) {
                    return;
                }
                
                // 替换文本
                const beforeText = textareaValue.substring(0, keywordPos);
                const afterText = textareaValue.substring(keywordPos + keyword.length);
                const newValue = beforeText + cmd.snippet + afterText;
                
                sourceInput.value = newValue;
                
                // 设置标志，阻止触发的 input 事件被处理
                this.suppressNextInput = true;
                
                // 触发 input 事件先
                const inputEvent = new Event('input', { bubbles: true });
                sourceInput.dispatchEvent(inputEvent);
                
                // 计算光标位置：从关键字结束位置 + offset
                const snippetEndOffset = keywordPos + cmd.snippet.length;
                const cursorOffset = snippetEndOffset + (cmd.offset || 0);
                const clampedOffset = Math.max(0, Math.min(cursorOffset, newValue.length));
                
                // 延迟设置光标，确保 Typora 完成了初始处理
                setTimeout(() => {
                    sourceInput.setSelectionRange(clampedOffset, clampedOffset);
                    sourceInput.focus();
                }, 10);
                
                this.hideAutoComplete();
                return;
            }
            
            // 如果找不到源输入框，使用原来的 DOM 修改方法但只修改公式内容
            
            // 提取 $$ 和 $$ 之间的内容
            const walker = document.createTreeWalker(
                mathBlock,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            let allNodes = [];
            let node;
            while (node = walker.nextNode()) {
                allNodes.push(node);
            }
            
            // 找到 $$ 标记
            let formulaStartNode = null;
            let formulaEndNode = null;
            let formulaStartOffset = -1;
            let formulaEndOffset = -1;
            
            let insideFormula = false;
            
            for (let i = 0; i < allNodes.length; i++) {
                const text = allNodes[i].textContent;
                
                if (!insideFormula && text.includes('$$')) {
                    const pos = text.indexOf('$$');
                    formulaStartNode = allNodes[i];
                    formulaStartOffset = pos + 2;
                    insideFormula = true;
                    
                    const endPos = text.indexOf('$$', formulaStartOffset);
                    if (endPos > formulaStartOffset) {
                        formulaEndNode = allNodes[i];
                        formulaEndOffset = endPos;
                        break;
                    }
                } else if (insideFormula && text.includes('$$')) {
                    const pos = text.indexOf('$$');
                    formulaEndNode = allNodes[i];
                    formulaEndOffset = pos;
                    break;
                }
            }
            
            if (!formulaStartNode || !formulaEndNode) {
                return;
            }
            
            // 只修改 $$ 之间的文本部分
            let formulaText = '';
            
            if (formulaStartNode === formulaEndNode) {
                formulaText = formulaStartNode.textContent.substring(formulaStartOffset, formulaEndOffset);
            } else {
                formulaText = formulaStartNode.textContent.substring(formulaStartOffset);
                
                for (let i = allNodes.indexOf(formulaStartNode) + 1; i < allNodes.indexOf(formulaEndNode); i++) {
                    formulaText += allNodes[i].textContent;
                }
                
                formulaText += formulaEndNode.textContent.substring(0, formulaEndOffset);
            }
            
            const keywordPos = formulaText.lastIndexOf(keyword);
            if (keywordPos < 0) {
                return;
            }
            
            const beforeText = formulaText.substring(0, keywordPos);
            const afterText = formulaText.substring(keywordPos + keyword.length);
            const newFormulaText = beforeText + cmd.snippet + afterText;
            
            // 关键：只修改公式内容，保留 $$ 标记在原位置
            if (formulaStartNode === formulaEndNode) {
                const beforePrefix = formulaStartNode.textContent.substring(0, formulaStartOffset);
                const afterSuffix = formulaStartNode.textContent.substring(formulaEndOffset);
                formulaStartNode.textContent = beforePrefix + newFormulaText + afterSuffix;
                
                const selection = window.getSelection();
                const finalRange = document.createRange();
                const snippetEndOffset = keywordPos + cmd.snippet.length;
                const cursorOffset = snippetEndOffset + (cmd.offset || 0);
                const clampedOffset = Math.max(0, Math.min(cursorOffset, newFormulaText.length));
                finalRange.setStart(formulaStartNode, formulaStartOffset + clampedOffset);
                finalRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(finalRange);
            } else {
                // 多节点情况：需要小心处理，确保保留 $$ 标记
                const beforePrefix = formulaStartNode.textContent.substring(0, formulaStartOffset);
                const afterSuffix = formulaEndNode.textContent.substring(formulaEndOffset);
                
                // 更新起始节点：保留前缀和 $$，添加新公式的开头
                const newStartContent = beforePrefix + newFormulaText.substring(0, 1);
                formulaStartNode.textContent = newStartContent;
                
                // 删除所有中间节点
                const startIdx = allNodes.indexOf(formulaStartNode);
                const endIdx = allNodes.indexOf(formulaEndNode);
                
                for (let i = startIdx + 1; i < endIdx; i++) {
                    const nodeToRemove = allNodes[i];
                    if (nodeToRemove.parentNode) {
                        nodeToRemove.parentNode.removeChild(nodeToRemove);
                    }
                }
                
                // 更新结束节点：将新公式的剩余部分 + 后缀 + $$
                const remainingFormula = newFormulaText.substring(1);
                formulaEndNode.textContent = remainingFormula + afterSuffix;
                
                const selection = window.getSelection();
                const finalRange = document.createRange();
                const snippetEndOffset = keywordPos + cmd.snippet.length;
                const cursorOffset = snippetEndOffset + (cmd.offset || 0);
                const clampedOffset = Math.max(0, Math.min(cursorOffset, newFormulaText.length));
                
                // 光标位置：可能在 formulaStartNode 或 formulaEndNode
                if (beforePrefix.length + clampedOffset < newStartContent.length) {
                    finalRange.setStart(formulaStartNode, beforePrefix.length + clampedOffset);
                } else {
                    const offsetInEnd = clampedOffset - (newStartContent.length - beforePrefix.length);
                    finalRange.setStart(formulaEndNode, offsetInEnd);
                }
                
                finalRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(finalRange);
            }
            
            this.hideAutoComplete();
        } catch (e) {
        }
    },

    applySnippetInline: function(cmd, inputKeyword) {
        // 为内联公式删除关键字并插入补全
        try {
            // 获取当前选区
            const selection = File.editor.selection.getRangy();
            if (!selection || !selection.collapsed) {
                console.log("[APPLY-INLINE] ERROR: Selection not available or not collapsed");
                return;
            }
            
            // 获取光标所在的容器和偏移量
            const range = selection.nativeRange;
            const container = range.startContainer;
            const offset = range.startOffset;
            
            if (container.nodeType !== 3) { // Text node
                return;
            }
            
            const text = container.textContent;
            
            // 从光标向前查找关键字
            const endPos = offset;
            const startPos = Math.max(0, endPos - inputKeyword.length);
            
            // 验证前面的文本确实是关键字
            const beforeKeyword = text.substring(startPos, endPos);
            
            // 删除关键字
            const beforeText = text.substring(0, startPos);
            const afterText = text.substring(endPos);
            const newText = beforeText + cmd.snippet + afterText;
            
            // 修改文本节点
            container.textContent = newText;
            
            // 计算光标位置
            const snippetEndOffset = startPos + cmd.snippet.length;
            const cursorOffset = snippetEndOffset + (cmd.offset || 0);
            const clampedOffset = Math.max(0, Math.min(cursorOffset, newText.length));
            
            // 设置光标位置
            const newRange = document.createRange();
            newRange.setStart(container, clampedOffset);
            newRange.collapse(true);
            
            const newSelection = window.getSelection();
            newSelection.removeAllRanges();
            newSelection.addRange(newRange);
            
            // 通知 Typora 编辑器内容已更新
            if (File && File.editor && File.editor.selection && File.editor.selection.scrollAdjust) {
                File.editor.selection.scrollAdjust();
            }
            
            this.hideAutoComplete();
        } catch (e) {
        }
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