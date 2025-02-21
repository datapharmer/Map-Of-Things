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

        // Render markers if they exist
        if (this.markersExist) {
            this.renderMarkers();
        }

        // Render shapefile
        await this.renderShapefile();

        // Dispatch custom event to notify the map is initialized
        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
    }

renderMarkers() {
    // Clear existing markers
    if (this.markerLayer) {
        this.map.removeLayer(this.markerLayer);
    }

    const customIcon = L.icon({
        iconSize: [50, 50],
        iconAnchor: [25, 50]
    });

    // Create a layer group for the markers
    this.markerLayer = L.layerGroup(
        this.markers.map(marker => {
            return L.marker([marker.lat, marker.lng], {
                icon: customIcon,
                title: marker.title || '',
                rotationAngle: marker.rotationAngle || 0
            }).bindPopup(marker.popupContent || '');
        })
    );

    // Add the marker layer to the map
    this.markerLayer.addTo(this.map);

    // Filter polygons after markers are rendered
    if (this.geoJsonLayer) {
        this.filterPolygons();
    }

    // Auto fit bounds if enabled
    if (this.autoFitBounds && this.markersExist) {
        this.map.flyToBounds(this.bounds, { padding: FIT_BOUNDS_PADDING });
    }
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

                    const label = L.marker(centroid, {
                        icon: L.divIcon({
                            className: 'shapefile-label',
                            html: labelText,
                            iconSize: [100, 20]
                        })
                    }).addTo(this.map);

                    layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });
                }
            }
        }).addTo(this.map);

        // Initial filtering of polygons based on existing markers
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

    checkPolygonForMarkers(layer, markers) {
    const polygonBounds = layer.getBounds();
    return markers.some(marker => {
        const markerLatLng = L.latLng(marker.lat, marker.lng);
        return polygonBounds.contains(markerLatLng) && layer.contains(markerLatLng);
    });
}
    
}
