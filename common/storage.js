var storage = new PatchStorage();

function PatchStorage() {
    var db = null;
    var pendingOpenDBRequest;

    function openDb() {
        return new Promise(function (onAccept, onReject) {
            /**
             * @type IDBOpenDBRequest
             */
            var db_req = indexedDB.open("content", 1);
            db_req.addEventListener("error", function (ev) {
                onReject(ev);
            });
            db_req.addEventListener("success", function (ev) {
                db = db_req.result;
                db.onerror = function (ev) {
                    console.error(ev);
                };
                onAccept(db);
            });
            db_req.addEventListener("upgradeneeded", function (ev) {
                var db = ev.target.result;
                PatchStorage._upgrade(db, ev.oldVersion, ev.newVersion);
            })
        });
    }

    this.getDb = function () {
        if (db === null) {
            if (!pendingOpenDBRequest) {
                pendingOpenDBRequest = openDb();
            }

            return pendingOpenDBRequest;
        } else {
            return Promise.resolve(db);
        }
    };

    this.getDb();
}

var url_parser = document.createElement('a');
/**
 *
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {"readonly"|"readwrite"} access
 * @returns {Promise}
 */
function openStore(db, storeName, access) {
    return new Promise(function (onAccept, onReject) {
        var trans = db.transaction(storeName, access);
        var store = trans.objectStore(storeName);
        onAccept(store);
    })
}
function packRequest(request) {
    return new Promise(function (onAccept, onReject) {
        request.onsuccess = onAccept;
        request.onerror = onReject;
    })
}
function packCursorRequest(request, ondata) {
    return new Promise(function (onAccept, onReject) {
        request.onsuccess = function (ev) {
            var cursor = ev.target.result;
            if (cursor) {
                ondata(cursor.key, cursor.value);
                cursor.continue();
            } else {
                onAccept();
            }
        };
        request.onerror = onReject;
    })
}
PatchStorage.prototype.query = function (url) {
    url_parser.href = url;
    var host = url_parser.host;
    var store;
    return this.getDb()
        .then(function (db) {
            return openStore(db, "matches", "readonly")
        })
        .then(function (m_store) {
            store = m_store;
            return new Promise(function (onAccept, onReject) {
                var idxer = store.index('host');
                var keys = [];
                idxer.openKeyCursor().onsuccess = function (event) {
                    var cursor = event.target.result;
                    if (cursor) {
                        if (isHostMatch(host, cursor.key)) {
                            keys.push(cursor.primaryKey);
                        }
                        cursor.continue();
                    } else {
                        onAccept(keys);
                    }
                };
            });
        })
        .then(function (keys) {
            var reqs = keys.map(function (key) {
                return new Promise(function (onAccept, onReject) {
                    var req = store.get(key);
                    req.onsuccess = function () {
                        onAccept(req.result);
                    };
                    req.onerror = onReject;
                })

            });
            return Promise.all(reqs);
        })
        .then(function(results){
            return Promise.resolve(results.filter(function(p){
                return url.match(p.matcher);
            }));
        });
};
PatchStorage.prototype.add = function (item) {
    return this.getDb().then(function (db) {
        return new Promise(function (onAccept, onReject) {
            var trans = db.transaction("matches", "readwrite");
            trans.oncomplete = onAccept;
            trans.onerror = onReject;
            var store = trans.objectStore("matches");
            store.add(item);
        });
    })
};
/**
 *
 * @param {object[]} items
 */
PatchStorage.prototype.setOrAddAll = function (items) {
    var store;
    var itemsToAdd = [], itemsToSet = [];
    items.forEach(function (p) {
        if (p.key) itemsToSet.push(p);
        else itemsToAdd.push(p);
    });

    return this.getDb().then(function (db) {
        return openStore(db, "matches", "readwrite");
    }).then(function (result) {
        store = result;
        return Promise.all(items.map(function (p) {
            return packRequest(store.put(p,p.key))
        }))
    })
};
PatchStorage.prototype.deleteAll=function (keys) {
    return this.getDb().then(function (db) {
        return openStore(db, "matches", "readwrite");
    }).then(function (store) {
        return Promise.all(keys.map(function (key) {
            return packRequest(store.delete(key));
        }))
    });
};

PatchStorage.prototype.getAll = function () {
    var store;
    var data, i = 0;

    return this.getDb()
        .then(function (db) {
            return openStore(db, 'matches', "readonly");
        })
        .then(function (result) {
            store = result;
            return packRequest(store.count())
        })
        .then(function (result) {
            data = new Array(result);
            var request = store.openCursor();
            return packCursorRequest(request, function (k, v) {
                Object.defineProperty(v, "key", {
                    value: k,
                    writable: false,
                    enumerable: false
                });
                data[i++] = v;
            })
        })
        .then(function () {
            return Promise.resolve(data);
        })
};
PatchStorage._upgrade = function (db, from, to) {
    switch (from) {
        //case 0:
        default:
    }
    //remove all old stores
    for (var storeName of db.objectStoreNames) {
        db.deleteObjectStore(storeName);
    }

    //create new store
    var objectStore = db.createObjectStore("matches", {autoIncrement: true});
    objectStore.createIndex("host", "host", {unique: false});
    objectStore.createIndex("type", "type", {unique: false});
};

function isHostMatch(host, match) {
    return !match || host == match || host.endsWith("." + match);
}