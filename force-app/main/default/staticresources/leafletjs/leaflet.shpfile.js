'use strict';

/* global cw, shp */
L.Shapefile = L.GeoJSON.extend({
    options: {
        importUrl: 'shp.js',
        isArrayBuffer: false // Corrected typo
    },

    initialize: function(file, options) {
        L.Util.setOptions(this, options);

        if (typeof cw !== 'undefined') {
            if (!options.isArrayBuffer) {
                this.worker = cw(this.createWorkerFunction(this.options.importUrl, false));
            } else {
                this.worker = cw(this.createWorkerFunction(this.options.importUrl, true));
            }
        }

        L.GeoJSON.prototype.initialize.call(this, {
            features: []
        }, options);
        this.addFileData(file);
    },

    createWorkerFunction: function(importUrl, isArrayBuffer) {
        // Create a Blob containing the worker function code
        const workerCode = `
            importScripts("${importUrl}");
            self.onmessage = function(event) {
                const data = event.data;
                if (!${isArrayBuffer}) {
                    shp(data).then(cb => self.postMessage(cb));
                } else {
                    self.postMessage(shp.parseZip(data));
                }
            };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const blobURL = URL.createObjectURL(blob);
        return blobURL; // Return URL for the worker
    },


    addFileData: function(file) {
        var self = this;
        this.fire('data:loading');

        if (typeof file !== 'string' && !('byteLength' in file)) {
            var data = this.addData(file);
            this.fire('data:loaded');
            return data;
        }

        if (!this.worker) {
            shp(file).then(function(data) {
                self.addData(data);
                self.fire('data:loaded');
            }).catch(function(err) {
                self.fire('data:error', err);
            });
            return this;
        }

        var promise;
        if (this.options.isArrayBuffer) {
            promise = this.worker.data(file, [file]);
        } else {
            promise = this.worker.data(cw.makeUrl(file));
        }

        promise.then(function(data) {
            self.addData(data);
            self.fire('data:loaded');
            self.worker.close(); // Close the worker
        }).catch(function(err) { // Corrected .then to .catch
            self.fire('data:error', err);
        });
        return this;
    }
});

L.shapefile = function(a, b, c) {
    return new L.Shapefile(a, b, c);
};
