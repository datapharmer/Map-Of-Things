import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
//import LEAFLETADDON from '@salesforce/resourceUrl/leafletjs_marker_rotate_addon';
//import LEAFLETCUSTOM from '@salesforce/resourceUrl/leaflet_custom_css';
//import CATILINE from'@salesforce/resourceUrl/catiline';
//import SHPFILE from'@salesforce/resourceUrl/leafletshpfile';
//import SHP from '@salesforce/resourceUrl/shp';
import SCHOOLDISTRICTS from'@salesforce/resourceUrl/schooldistricts';


const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const LEAFLETADDON_JS_URL = '/leafletjs_marker_rotate_addon.js';
const CATILINE_JS_URL = '/catiline.js';
const SHPFILE_JS_URL = '/shpfile.js';
const SHP_JS_URL = '/shp.js';
const SCHOOLDISTRICTS_URL = '/schooldistricts.zip';
const MIN_ZOOM = 2;
const FIT_BOUNDS_PADDING = [20, 20];
const MAP_CONTAINER = 'div.inner-map-container';
const CUSTOM_EVENT_INIT = 'init';

export default class MapOfThingsMap extends LightningElement {
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
            loadScript(this, LEAFLET_JS + CATILINE_JS_URL),
            loadScript(this, LEAFLET_JS + SHPFILE_JS_URL),
	    loadScript(this, LEAFLET_JS + SHP_JS_URL)
        ]).then(() => {
	   console.log("process promise");
            this.drawMap();
        });
	.catch(err => {
   	    console.log('Error loading promise');
   	    console.log(err);
  	});
    }
    drawMap(){
	    				console.log("start drawing map");
        const container = this.template.querySelector(MAP_CONTAINER);
        this.map = L.map(container, { 
            zoomControl: true, tap:false   
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);    
        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);
	    				console.log("start loading shapefile with school districts: " + this.schooldistrictsUrl);
	    //todo: check into rangeparent issue in firefox related to Component.index():'Invalid redundant use of component.index().

		        var shpfile = new L.Shapefile(this.schooldistrictsUrl, {
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

		shpfile.addTo(this.map);
	    		console.log("shapefile data added to map");
			shpfile.once("data:loaded", function() {
				console.log("finished loaded shapefile");
			});
			this.dispatchEvent(new CustomEvent(
				CUSTOM_EVENT_INIT, {detail: this.map}
			));
    }
    fitBounds(){
        if (this.markersExist) this.map.flyToBounds(this.bounds, {padding: FIT_BOUNDS_PADDING});
    }

}
