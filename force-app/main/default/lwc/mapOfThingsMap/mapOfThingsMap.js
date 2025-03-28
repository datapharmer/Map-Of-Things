import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import SCHOOLDISTRICTS_ZIP from '@salesforce/resourceUrl/schooldistricts';

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const LEAFLETADDON_JS_URL = '/leafletjs_marker_rotate_addon.js';
const SHPFILE_JS_URL = '/leaflet.shpfile.js';
const SHP_JS_URL = '/shp.js';
const CATILINE_JS_URL = '/catiline.js';
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

    @api
    get markers() {
        return this._markers;
    }
    set markers(newMarkers) {
        if (newMarkers && newMarkers.length >= 0) {
            this._markers = [...newMarkers];
            if (this.map) {
                //this.renderMarkers(); // Render markers whenever the markers array is updated.
            }
        }
    }

    get markersExist() {
        return this.markers && this.markers.length > 0;
    }

    get bounds() {
        if (this.markersExist) {
            return this.markers.map(marker => {
                return [marker.lat, marker.lng];
            });
        }
        return [];
    }

    renderedCallback() {
        this.template.querySelector(MAP_CONTAINER).style.height = this.mapSizeY;
    }

async drawMap() {
    const container = this.template.querySelector(MAP_CONTAINER);
    this.map = L.map(container, {
        zoomControl: true,
        tap: false
    }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);

    // Add tile layer
    L.tileLayer(this.tileServerUrl, {
        minZoom: MIN_ZOOM,
        attribution: this.tileServerAttribution,
        unloadInvisibleTiles: true
    }).addTo(this.map);

    // Render markers if they exist BEFORE shapefile
    if (this.markersExist) {
        this.renderMarkers();
    }

    // Render shapefile, and THEN filter
    await this.renderShapefile();


    // Dispatch custom event to notify the map is initialized
    this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
}

async renderShapefile() {
    try {
        const shpfile = SCHOOLDISTRICTS_ZIP;
        const response = await fetch(shpfile);
        if (!response.ok) {
            throw new Error(`Failed to fetch shapefile: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const geojson = await shp(arrayBuffer);

        // Create a separate layer group for labels
        this.labelLayer = L.layerGroup().addTo(this.map);

        // Add GeoJSON to the map with styles
        this.geoJsonLayer = L.geoJSON(geojson, {
            style: function(feature) {
                return {
                    color: '#CC5500',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.5
                };
            },
            onEachFeature: (feature, layer) => {
                if (feature.properties) {
                    const labelText = feature.properties.NAME;
                    const centroid = layer.getBounds().getCenter();

                    // Add label to the separate label layer
                    const label = L.marker(centroid, {
                        icon: L.divIcon({
                            className: 'shapefile-label',
                            html: labelText,
                            iconSize: [100, 20]
                        })
                    }).addTo(this.labelLayer);

                    layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });
                }
            }
        }).addTo(this.map);

        // FILTER POLYGONS **AFTER** shapefile is loaded AND markers are rendered
        if (this.markers && this.markers.length > 0) {
            this.filterPolygons();
        }

        if (this.autoFitBounds) {
            const bounds = this.geoJsonLayer.getBounds();
            if (bounds.isValid()) {
                this.map.fitBounds(bounds);
            }
        }
    } catch (error) {
        console.error('Error loading or parsing shapefile:', error);
    }
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

checkPolygonForMarkers(layer) {
    if (!this.markerLayer) return false;
    
    let hasMarkerInside = false;
    this.markerLayer.eachLayer(marker => {
        if (hasMarkerInside) return; // Skip if we already found a marker
        const markerLatLng = marker.getLatLng();
        if (layer.getBounds().contains(markerLatLng) && layer.contains(markerLatLng)) {
            hasMarkerInside = true;
        }
    });
    return hasMarkerInside;
}

filterPolygons() {
    if (!this.geoJsonLayer || !this.markerLayer) return;
    
    this.geoJsonLayer.eachLayer(layer => {
        if (layer.feature && layer.feature.geometry.type.includes('Polygon')) {
            const hasMarkers = this.checkPolygonForMarkers(layer);
            if (!hasMarkers) {
                layer.setStyle({ 
                    opacity: 0, 
                    fillOpacity: 0,
                    pointerEvents: 'none' // This will make the hidden polygons non-interactive
                });
            } else {
                layer.setStyle({ 
                    opacity: 1, 
                    fillOpacity: 0.5,
                    pointerEvents: 'auto'
                });
            }
        }
    });
}
    
}
