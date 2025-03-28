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
    markerLayer;
    geoJsonLayer;
    labelLayer;

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
                this.renderMarkers();
                if (this.geoJsonLayer) {
                    this.filterPolygons();
                }
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

    async connectedCallback() {
        try {
            // Load external JS and CSS libraries
            await Promise.all([
                loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL),
                loadScript(this, LEAFLET_JS + LEAFLET_JS_URL),
                loadScript(this, LEAFLET_JS + LEAFLETADDON_JS_URL),
                loadScript(this, LEAFLET_JS + CATILINE_JS_URL),
                loadScript(this, LEAFLET_JS + SHP_JS_URL),
                loadScript(this, LEAFLET_JS + SHPFILE_JS_URL)
            ]);
            this.drawMap();
        } catch (error) {
            console.error('Error loading external libraries:', error);
        }
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

        // Create a marker layer group to hold all markers
        this.markerLayer = L.layerGroup().addTo(this.map);

        // Render markers if they exist
        if (this.markersExist) {
            this.renderMarkers();
        }

        // Render shapefile, and THEN filter
        await this.renderShapefile();

        // Dispatch custom event to notify the map is initialized
        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
    }

    renderMarkers() {
        // Clear existing markers
        if (this.markerLayer) {
            this.markerLayer.clearLayers();
        }

        // Add new markers
        this.markers.forEach(marker => {
            const leafletMarker = L.marker([marker.lat, marker.lng])
                .bindPopup(marker.popup);
            
            leafletMarker.addTo(this.markerLayer);
        });
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

            // Add GeoJSON to the map with styles - initially hide all polygons
            this.geoJsonLayer = L.geoJSON(geojson, {
                style: function(feature) {
                    return {
                        color: '#3388ff',
                        weight: 2,
                        opacity: 0,
                        fillOpacity: 0,
                        fillColor: '#3388ff'
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

            // Filter polygons after shapefile is loaded and markers are rendered
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
        const layerBounds = layer.getBounds();
        
        this.markerLayer.eachLayer(marker => {
            if (hasMarkerInside) return; // Skip if we already found a marker
            
            const markerLatLng = marker.getLatLng();
            
            // First check if marker is within the bounds (faster check)
            if (layerBounds.contains(markerLatLng)) {
                // Then do the more precise polygon containment check
                try {
                    // For polygons, we need to check if the point is inside
                    if (layer.contains(markerLatLng)) {
                        hasMarkerInside = true;
                    }
                } catch (e) {
                    // Some layers might not support contains method
                    console.warn('Layer does not support contains method:', e);
                }
            }
        });
        
        return hasMarkerInside;
    }

    filterPolygons() {
        if (!this.geoJsonLayer || !this.markerLayer) return;
        
        this.geoJsonLayer.eachLayer(layer => {
            if (layer.feature && layer.feature.geometry && 
                layer.feature.geometry.type && 
                layer.feature.geometry.type.includes('Polygon')) {
                
                const shouldShow = this.checkPolygonForMarkers(layer);
                
                // Update the style to show or hide the polygon
                layer.setStyle({
                    opacity: shouldShow ? 1 : 0,
                    fillOpacity: shouldShow ? 0.2 : 0,
                    pointerEvents: shouldShow ? 'auto' : 'none'
                });
            }
        });
        
        // Update labels visibility to match polygons
        if (this.labelLayer) {
            this.labelLayer.eachLayer(label => {
                const labelPos = label.getLatLng();
                let showLabel = false;
                
                // Check if this label's position is within a visible polygon
                this.geoJsonLayer.eachLayer(polygonLayer => {
                    if (showLabel) return;
                    
                    if (polygonLayer.options && 
                        polygonLayer.options.opacity > 0 && 
                        polygonLayer.getBounds().contains(labelPos)) {
                        showLabel = true;
                    }
                });
                
                // Set label visibility
                const iconEl = label.getElement();
                if (iconEl) {
                    iconEl.style.display = showLabel ? 'block' : 'none';
                }
            });
        }
    }
}
