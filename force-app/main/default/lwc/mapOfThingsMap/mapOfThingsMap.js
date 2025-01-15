import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
//import LEAFLETADDON from '@salesforce/resourceUrl/leafletjs_marker_rotate_addon';
//import LEAFLETCUSTOM from '@salesforce/resourceUrl/leaflet_custom_css';
//import CATILINE from'@salesforce/resourceUrl/catiline';
//import SHPFILE from'@salesforce/resourceUrl/leafletshpfile';
//import SHP from '@salesforce/resourceUrl/shp';
//import DRAWMAP from '@salesforce/resourceUrl/drawmap'
import SCHOOLDISTRICTS from'@salesforce/resourceUrl/schooldistricts';

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const LEAFLETADDON_JS_URL = '/leafletjs_marker_rotate_addon.js';
const CATILINE_JS_URL = '/catiline.js';
const SHPFILE_JS_URL = '/shpfile.js';
const SHP_JS_URL = '/shp.js';
const DRAWMAP_JS_URL = '/drawmap.js';
const SCHOOLDISTRICTS_URL = '/schooldistricts.zip';
const MIN_ZOOM = 2;
const FIT_BOUNDS_PADDING = [20, 20];
const MAP_CONTAINER = 'div.inner-map-container';
const CUSTOM_EVENT_INIT = 'init';

export default class MapOfThingsMap extends LightningElement {
    drawmap = DRAWMAP_JS_URL;
    schooldistrictsUrl = SCHOOLDISTRICTS;
	
    map;    
    _markers = [];

    @api tileServerUrl;
    @api tileServerAttribution;
    @api mapSizeY;
    @api mapDefaultPosition;
    @api mapDefaultZoomLevel;
    @api autoFitBounds;
    @api
    get markers(){
        return this._markers;
    }
    set markers(newMarkers){
        if (newMarkers && newMarkers.length >= 0){
            this._markers = [...newMarkers];
            if (this.autoFitBounds) this.fitBounds();
        }
    }    

    get markersExist(){
        return this.markers && this.markers.length > 0;
    }
    get bounds(){
        if (this.markersExist){
            return this.markers.map(marker => {
                return [marker.lat, marker.lng];
            });
        }
        return [];
    }

    renderedCallback() {
        this.template.querySelector(MAP_CONTAINER).style.height = this.mapSizeY;
    }
    connectedCallback(){
        Promise.allSettled([
            loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL),
	    loadScript(this, LEAFLET_JS + LEAFLET_JS_URL),
	    loadScript(this, LEAFLET_JS + LEAFLETADDON_JS_URL),
	    loadScript(this, LEAFLET_JS + DRAWMAP_JS_URL),
            loadScript(this, LEAFLET_JS + CATILINE_JS_URL),
            loadScript(this, LEAFLET_JS + SHPFILE_JS_URL),
	    loadScript(this, LEAFLET_JS + SHP_JS_URL)
        ]).then(() => {
	   console.log("process promise");
            drawMap();
        })
	.catch(function(e) {
   	    console.log('Error loading promise');
   	    console.log(e);
	    console.log(e.message);
  	});
    }
	
	
    fitBounds(){
        if (this.markersExist) this.map.flyToBounds(this.bounds, {padding: FIT_BOUNDS_PADDING});
}
}
