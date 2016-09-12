"use strict";

var patchList;
var patches;
var deletedPatches = [];
storage.getAll().then(function (result) {
    patches = result;
    patches.forEach(function (patch) {
        patch.ischanged = false;
        patch.isMatcherError = false;
    });
    patchList = new Vue({
        el: "#patch_list",
        data: {
            patches: patches
        },
        methods: {
            markChanged: function (p) {
                p.ischanged = true;
                p.isMatcherError = false;
                try {
                    new RegExp(p.matcher)
                } catch (ex) {
                    p.isMatcherError = true;
                }
            },
            doDelete: function (p) {
                if (p.key)
                    deletedPatches.push(p.key);
                patches.$remove(p);
            }
        }
    })
});

var btnSave = document.getElementById("btn_save");
btnSave.addEventListener('click', saveChanges);

var btnAdd = document.getElementById("btn_add");
btnAdd.addEventListener('click', addPatch);
function addPatch() {
    patches.push({
        ischanged: true,
        matcher: '.*',
        type: 'css'
    });
}
function saveChanges() {
    var hasError = false;
    var changedPatch = patches.filter(function (p) {
        if (p.isMatcherError)
            hasError = true;
        return p.ischanged;
    });
    if (hasError) {
        alert("Error!");
        return;
    }
    storage.deleteAll(deletedPatches)
        .then(function () {
            return storage.setOrAddAll(changedPatch)
        })
        .then(function () {
            alert("OK!");
            location.reload(1)
        }, function () {
            alert("Error");
        })
}