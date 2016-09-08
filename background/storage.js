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
                PatchStorage.upgrade(db, ev.oldVersion, ev.newVersion);
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

PatchStorage.upgrade = function (db, from, to) {
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
    return host == match || host.endsWith("." + match);
}