chrome.tabs.onUpdated.addListener(onUpdated);

/**
 * on tab updated
 * @param {int} tabId
 * @param {chrome.tabs.TabChangeInfo} changeInfo
 * @param {chrome.tabs.Tab} tab
 */
function onUpdated(tabId, changeInfo, tab) {
    switch (changeInfo.status) {
        case 'loading':
            console.log("Tab[%d]", tabId);
            var start_time = Date.now();
            doPatch(tab).then(function (rc) {
                var end_time = Date.now();
                console.log("[Tab - %s] %d patchs applied(%d ms)", tab.title, rc.length, end_time - start_time);
            });
            break;
    }
}

/**
 * @param {chrome.tabs.Tab} tab
 */
function doPatch(tab) {
    return storage.query(tab.url).then(function (result) {
        if (result instanceof Array) {
            return Promise.all(result.map(applyPatch.bind(tab)));
        }
        return [];
    });
}

/**
 * @this chrome.tabs.Tab
 * @param patch
 */
function applyPatch(patch) {
    return new Promise((function (onAccept, onReject) {
        switch (patch.type) {
            case 'css':
                chrome.tabs.insertCSS(this.id, {
                    code: patch.code,
                    allFrames: true,
                    matchAboutBlank: true,
                    runAt: "document_start"
                }, function (cb) {
                    onAccept(patch.host)
                });
                break;
            case 'js':
                chrome.tabs.executeScript(this.id, {
                    code: patch.code,
                    allFrames: true,
                    matchAboutBlank: true,
                    runAt: patch.runAt ? patch.runAt : "document_end"
                }, function (cb) {
                    onAccept(patch.host)
                });
                break;
        }
    }).bind(this));
}