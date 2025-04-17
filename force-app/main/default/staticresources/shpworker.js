import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
const SHP_JS_URL = '/shp.js';
importScripts(LEAFLET_JS + SHP_JS_URL);

self.onmessage = function(event) {
    const data = event.data;
    const isArrayBuffer = event.data.isArrayBuffer; // Access isArrayBuffer from the message data

    if (!isArrayBuffer) {
        shp(data).then(cb => self.postMessage(cb));
    } else {
        self.postMessage(shp.parseZip(data));
    }
};
