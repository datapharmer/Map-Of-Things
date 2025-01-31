	'use strict';

/* global cw, shp */
L.Shapefile = L.GeoJSON.extend({
    options: {
        importUrl: 'shp.js',
        isArrayBuffer: false
    },

     initialize: function(file, options) {
        L.Util.setOptions(this, options);

        if (typeof cw !== 'undefined') {
            this.worker = cw(this.createWorkerFunction(this.options.importUrl)); // No need to pass isArrayBuffer here
        }

        L.GeoJSON.prototype.initialize.call(this, { features: [] }, options);
        this.addFileData(file);
    },

    createWorkerFunction: function(importUrl) {  // importUrl is now the name of the static resource
        const workerURL = `/resource/${importUrl}`; // Construct the URL directly
        return workerURL; // Return the URL
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
            promise = this.worker.data({ data: file, isArrayBuffer: true }, [file]); // Send isArrayBuffer in the message
        } else {
            promise = this.worker.data({ data: file, isArrayBuffer: false }); // Send isArrayBuffer in the message
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
