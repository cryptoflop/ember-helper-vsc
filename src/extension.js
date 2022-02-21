'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const path_1 = require("path");
const fs_1 = require("fs");
const filendir_1 = require("filendir");
const debounce_1 = require("./debounce");
const child_process_1 = require("child_process");
const treeKill = require("tree-kill");
function existsAsync(path) {
    return new Promise((resolve, reject) => {
        try {
            fs_1.exists(path, function (exists) {
                resolve(exists);
            });
        }
        catch (ex) {
            reject(ex);
        }
    });
}
exports.existsAsync = existsAsync;
let buildButton;
let toggleButton;
let isEmberProject;
let outputchannel;
function activate(context) {
    return __awaiter(this, void 0, void 0, function* () {
        buildButton = vscode_1.window.createStatusBarItem(vscode_1.StatusBarAlignment.Right, 1000);
        buildButton.color = 'gray';
        buildButton.command = 'vs-ember-helper.toggleBuild';
        buildButton.text = '$(primitive-dot)';
        buildButton.tooltip = 'Ember Build (' + buildState + ')';
        buildButton.hide();
        toggleButton = vscode_1.window.createStatusBarItem(vscode_1.StatusBarAlignment.Right, 1001);
        toggleButton.hide();
        let emberProjectWatcher = vscode_1.workspace.createFileSystemWatcher(vscode_1.workspace.rootPath + '\\ember-cli-build.js', false, true, false);
        emberProjectWatcher.onDidCreate(() => checkForEmberProject(context));
        emberProjectWatcher.onDidDelete(() => checkForEmberProject(context));
        yield checkForEmberProject(context);
        outputchannel = vscode_1.window.createOutputChannel('VS Ember Helper');
        outputchannel.appendLine('VS Ember Helper started.');
        outputchannel.appendLine((isEmberProject ? '' : 'No ') + 'Ember-Project detected.');
        let fileWatcher = vscode_1.workspace.createFileSystemWatcher('**/*', false, true, false);
        fileWatcher.onDidCreate(updateToggleState);
        fileWatcher.onDidDelete(updateToggleState);
        context.subscriptions.push(buildButton);
        context.subscriptions.push(toggleButton);
        context.subscriptions.push(vscode_1.window.onDidChangeActiveTextEditor(updateToggleState));
        context.subscriptions.push(vscode_1.commands.registerCommand('vs-ember-helper.toggle', toggle));
        context.subscriptions.push(vscode_1.commands.registerCommand('vs-ember-helper.create', create));
        context.subscriptions.push(vscode_1.commands.registerCommand('vs-ember-helper.toggleBuild', toggleBuild));
        if (yield existsAsync(vscode_1.workspace.rootPath + '\\ember-cli-build.js')) {
            buildButton.show();
        }
    });
}
exports.activate = activate;
let buildState = 'STOPPED';
let buildProcess;
function toggleBuild() {
    const emberBuildConfig = vscode_1.workspace.getConfiguration('emberbuild');
    const batPath = String(emberBuildConfig.get('path'));
    if (batPath) {
        switch (buildState) {
            case 'STOPPED':
                outputchannel.clear();
                buildProcess = child_process_1.execFile(batPath);
                buildProcess.stdout.setEncoding('latin1');
                buildProcess.stdout.on('data', chunk => emberBuildUpdate(chunk, false));
                buildProcess.stderr.setEncoding('latin1');
                buildProcess.stderr.on('data', chunk => emberBuildUpdate(chunk, true));
                buildProcess.on('exit', code => {
                    console.log('ERROR: ' + code);
                    stopBlink();
                    buildButton.tooltip = 'Ember Build Failed with: \n' + code + '\n and last message: \n' + buildButton.tooltip;
                    buildButton.color = 'gray';
                    buildState = 'STOPPED';
                });
                buildState = 'STARTED';
                break;
            case 'STARTED':
                buildState = 'STOPPING';
                treeKill(buildProcess.pid, 'SIGKILL', () => {
                    buildButton.color = 'gray';
                    buildState = 'STOPPED';
                    buildButton.tooltip = 'Ember Build (' + buildState + ')';
                });
                break;
            default: break;
        }
    }
}
let lastChunk;
function emberBuildUpdate(chunk, error) {
    outputchannel.appendLine(chunk);
    buildButton.tooltip = chunk;
    if (error) {
        if (chunk.indexOf('Warning:') >= 0 || chunk.indexOf('but never used') >= 0) {
            blink();
            lastChunk = chunk;
            return;
        }
        buildButton.color = 'red';
    }
    else {
        if (chunk.indexOf('Slowest Nodes') >= 0) {
            buildButton.color = 'green';
            const ms = lastChunk.split(' ')[2].trim().replace('(', '').replace(')', '').replace('ms', '').split('[')[0].slice(0, -1);
            buildButton.tooltip = 'Successful: ' + (Number(ms) / 1000).toFixed(1) + ' seconds' + chunk;
        }
        else {
            blink();
            lastChunk = chunk;
            return;
        }
    }
    stopBlink();
    lastChunk = chunk;
}
let blinking = false;
let lastTimeout;
function blinkOn() {
    lastTimeout = setTimeout(() => {
        buildButton.color = '#ff6d3e';
        if (blinking) {
            blinkOff();
        }
    }, 260);
}
function blinkOff() {
    lastTimeout = setTimeout(() => {
        buildButton.color = '#ff8b65';
        if (blinking) {
            blinkOn();
        }
    }, 260);
}
function blink() {
    if (!blinking) {
        blinkOn();
        blinking = true;
    }
}
function stopBlink() {
    blinking = false;
    if (lastTimeout) {
        clearTimeout(lastTimeout);
        lastTimeout = undefined;
    }
}
function checkForEmberProject(context) {
    return __awaiter(this, void 0, void 0, function* () {
        toggleActive(yield existsAsync(vscode_1.workspace.rootPath + '\\ember-cli-build.js'), context);
    });
}
function toggleActive(active, context) {
    isEmberProject = active;
    if (active) {
        updateToggleState();
    }
    else {
        toggleButton.hide();
    }
}
function getConcurrentFile(check = true) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!vscode_1.window || !vscode_1.window.activeTextEditor) {
            return;
        }
        let filePath = path_1.parse(vscode_1.window.activeTextEditor.document.fileName);
        let concurrentExt = { '.hbs': '.js', '.js': '.hbs' }[filePath.ext];
        if (!concurrentExt) {
            // return if not .js or .hbs
            return;
        }
        let concPath = path_1.resolve(filePath.dir + (filePath.ext === '.js' ? '\\..\\templates\\components\\' : '\\..\\..\\components\\') + filePath.name + concurrentExt);
        if (check) {
            return (yield existsAsync(concPath)) ? concPath : undefined;
        }
        else {
            return concPath;
        }
    });
}
function updateToggleState() {
    debounce_1.default(debouncedUpdateToggleState, 20, false)();
}
function debouncedUpdateToggleState() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isEmberProject) {
            return;
        }
        toggleButton.color = undefined;
        toggleButton.command = undefined;
        toggleButton.text = '$(search)  Searchin... ';
        toggleButton.show();
        let concurrentFile = yield getConcurrentFile();
        if (!concurrentFile) {
            if (vscode_1.window && vscode_1.window.activeTextEditor) {
                let ext = path_1.parse(vscode_1.window.activeTextEditor.document.fileName).ext;
                if (ext === '.hbs' || ext === '.js') {
                    toggleButton.color = '#4CAF50';
                    toggleButton.command = 'vs-ember-helper.create';
                    toggleButton.text = '$(plus)  Create ' + (ext === '.js' ? 'Template ' : 'Component ');
                    return;
                }
            }
            toggleButton.hide();
        }
        else {
            toggleButton.command = 'vs-ember-helper.toggle';
            if (path_1.parse(concurrentFile).ext === '.js') {
                toggleButton.text = '$(file-text)  Component ';
                toggleButton.color = '#42A5F5';
            }
            else {
                toggleButton.text = '$(file-code)  Template ';
                toggleButton.color = '#FFAB40';
            }
        }
    });
}
function toggle() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!vscode_1.window || !vscode_1.window.activeTextEditor) {
            return;
        }
        let concurrentFile = yield getConcurrentFile();
        if (concurrentFile) {
            let document = yield vscode_1.workspace.openTextDocument(concurrentFile);
            if (document) {
                let editor = yield vscode_1.window.showTextDocument(document, 1, false);
            }
        }
    });
}
function create() {
    return __awaiter(this, void 0, void 0, function* () {
        let concurrentFile = yield getConcurrentFile(false);
        let content = path_1.parse(concurrentFile).ext === '.js' ?
            'import Ember from \'ember\';'
            :
                '<div>Your Template</div>';
        filendir_1.wa(concurrentFile, content, error => {
            if (!error) {
                toggle();
            }
        });
    });
}
//# sourceMappingURL=extension.js.map