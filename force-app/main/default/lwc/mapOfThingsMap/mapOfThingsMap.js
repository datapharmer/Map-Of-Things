import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import SCHOOLDISTRICTS from'@salesforce/resourceUrl/schooldistricts';

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const LEAFLETADDON_JS_URL = '/leafletjs_marker_rotate_addon.js';
const CATILINE_JS_URL = '/catiline.js';
const SHPFILE_JS_URL = '/leaflet.shpfile.js';
const SHP_JS_URL = '/shp.js';
const MIN_ZOOM = 2;
const FIT_BOUNDS_PADDING = [20, 20];
const MAP_CONTAINER = 'div.inner-map-container';
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
    @api Shapefile;
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
    async connectedCallback(){
	    /*
		console.log("starting async for shapedata load");    	
		console.log("Fetch shapedata");
		const shapedata = await fetch(SCHOOLDISTRICTS)
			.then(response => {
	    			if (!response.ok) {
	      				throw new Error('Network response for SCHOOLDISTRICTS fetch was not ok');
	    			}
				console.log("returning blob inside fetch");
	    			return response.blob(); // Returns a promise that resolves with a Blob
	  		})
	  		.then(function (myBlob) {
				console.log("processing blob result to return");
	                	return {blob: myBlob};
				
	            	}); 
	      */
	    	try {
	        await Promise.all([
	            loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL),
				loadScript(this, LEAFLET_JS + LEAFLET_JS_URL),
				loadScript(this, LEAFLET_JS + LEAFLETADDON_JS_URL),
				loadScript(this, LEAFLET_JS + CATILINE_JS_URL),
				loadScript(this, LEAFLET_JS + SHP_JS_URL),
				loadScript(this, LEAFLET_JS + SHPFILE_JS_URL)
	        ])
		.then(() => {
			console.log("promises loaded");
		})
		.catch(function(e) {
	   	    console.log('Error loading promise');
	   	    console.log(e);
		    console.log(e.message);
	  	})
	    }
	    catch (error) {
		console.log('Error with async');
		console.log(error);
		console.log(error.message);
  	   }

	    this.drawMap();
    }
	
     async drawMap(){
        const container = this.template.querySelector(MAP_CONTAINER);
        console.log("container defined: " + container);
	this.map = L.map(container, { 
            zoomControl: true, tap:false   
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);  
	console.log("mapping set");
        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);
	    console.log("shapefile with school districts details: " + SCHOOLDISTRICTS);
	    //todo: check into rangeparent issue in firefox related to Component.index():'Invalid redundant use of component.index().
	console.log("catiline: " + LEAFLET_JS + CATILINE_JS_URL);
	console.log("shpfile: " + LEAFLET_JS + SHPFILE_JS_URL);
	console.log("shp url: " + LEAFLET_JS + SHP_JS_URL);
	     
        try { 
            const response = await fetch(SCHOOLDISTRICTS).arrayBuffer();
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
		    return;
            }
            try {
		console.log("get shpfile via arraybuffer");
  
                const shpfile = new L.Shapefile(response, {
                    onEachFeature: (feature, layer) => {
                        if (feature.properties) {
                            layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });
                        }
                    }
                });
		console.log("add shpfile to map");
                shpfile.addTo(this.map);

                shpfile.once("data:loaded", () => {
                    console.log("Shapefile data loaded!");
                    if (this.autoFitBounds) {
                        const bounds = shpfile.getBounds();
                        if (bounds.isValid()) {
                            this.map.fitBounds(bounds);
                        } else {
                            console.warn("Invalid bounds for shapefile (empty or malformed).");
                        }
                    }
                });

                shpfile.once("error", (error) => { // Handle errors during shapefile loading
                    console.error("Error loading shapefile:", error);
                });

            } catch (shpError) {
                console.error("Error parsing shapefile:", shpError); // Catch parsing errors
		return;
            }
        } catch (error) {
            console.error("Error loading or parsing shapefile:", error);
	    return;
        }	     
	    		console.log("shapefile data added to map");
			this.dispatchEvent(new CustomEvent(
				CUSTOM_EVENT_INIT, {detail: this.map}
			));
 }

  generatePopupContent(properties) {
      let content = '';
      for (const key in properties) {
          if (properties.hasOwnProperty(key)) {
              content += `${key}: ${properties[key]}<br>`;
          }
      }
      return content;
  }
	
    fitBounds(){
        if (this.markersExist) this.map.flyToBounds(this.bounds, {padding: FIT_BOUNDS_PADDING});
}
}
