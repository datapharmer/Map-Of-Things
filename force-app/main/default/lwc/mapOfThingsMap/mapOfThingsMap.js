import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import LEAFLETADDON from '@salesforce/resourceUrl/leafletjs_marker_rotate_addon';
import LEAFLETCUSTOM from '@salesforce/resourceUrl/leaflet_custom_css';
import CATILINE from'@salesforce/resourceUrl/catiline';
import SHPFILE from'@salesforce/resourceUrl/leafletshpfile';
import SHP from '@salesforce/resourceUrl/shp';
import SCHOOLDISTRICTS from'@salesforce/resourceUrl/schooldistricts';


const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
//const CATILINE_JS_URL = '/catiline.js';
//const SHPFILE_JS_URL = '/leaflet.shpfile.js';
//const SHP_JS_URL = '/shp.js';
//const SCHOOLDISTRICTS_URL = '/schooldistricts.zip';
const MIN_ZOOM = 2;
const FIT_BOUNDS_PADDING = [20, 20];
const MAP_CONTAINER = 'div.map-container';
const CUSTOM_EVENT_INIT = 'init';

export default class MapOfThingsMap extends LightningElement {

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
        Promise.all([
            loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL),
            loadStyle(this, LEAFLETCUSTOM),
            loadScript(this, CATILINE),
            loadScript(this, SHPFILE),
	    loadScript(this, SHP),
            loadScript(this, LEAFLETADDON)
        ]).then(() => {
            this.drawMap();
        });
    }
    drawMap(){
        const container = this.template.querySelector(MAP_CONTAINER);
        this.map = L.map(container, { 
            zoomControl: true, tap:false   
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);    
        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);
        this.dispatchEvent(new CustomEvent(
            CUSTOM_EVENT_INIT, {detail: this.map}
        ));
        this.shpfile = new L.Shapefile(SCHOOLDISTRICTS, {
			onEachFeature: function(feature, layer) {
				if (feature.properties) {
					layer.bindPopup(Object.keys(feature.properties).map(function(k) {
						return k + ": " + feature.properties[k];
					}).join("<br />"), {
						maxHeight: 200
					});
				}
			}
		});
	shpfile.addTo(m);
		shpfile.once("data:loaded", function() {
			console.log("finished loaded shapefile");
		});
    }
    fitBounds(){
        if (this.markersExist) this.map.flyToBounds(this.bounds, {padding: FIT_BOUNDS_PADDING});
    }

}
