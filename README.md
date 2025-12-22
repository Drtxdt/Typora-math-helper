# Typora-math-helper

## 这是什么

这里是Typora-math-helper，一个Typora插件。它可以在你编写公式时给你提供自动补全建议，全面支持行内公式和块级公式，给你像VS Code ~~微软大战代码~~ 一样的体验

## 特性

- IDE级别的建议与补全
- 多层嵌套识别
- 公式环境识别

其中，行内公式可以在补全之后直接将光标置于花括号内，方便你继续输入，就像这样：

![inline](img/inline.gif)

对于块级公式，由于本人水平有限，目前仅支持补全，光标会停在补全后的字符串后面，就像这样：

![para](img/para.gif)

## 快速开始

首先，你得有一个可以运行的Typora，没有请去[官网](typora.io)买一份，支持正版谢谢喵

下载或者

克隆本项目

```bash
git clone https://github.com/Drtxdt/Typora-math-helper.git
```

然后，将本项目的文件夹整个拷贝到你的Typora安装路径，具体为

```text
*/Typora/resources
```

其中 `resources` 目录下会有一个 `window.html` 。如果你看到了，大概率是对的

下一步，将文件夹中的脚本 `install.ps1` 移动到 `resources` 目录下，然后运行

完成之后，重启Typora，享受你的无痛公式编辑体验吧！

---

这是一个大学生为爱发电的小项目，如果你认为有用或者有趣的话，请给我点亮Star，这对我来说很重要，谢谢！

如果你发现了Bug或者有改进建议，欢迎提出Issue或者PR

