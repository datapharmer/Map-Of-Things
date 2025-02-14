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
    markerLayer = null; // Store marker layer
    geoJsonLayer = null; // Store GeoJSON layer
    shapefileLoaded = false;
    markersLoaded = false;

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
            this.markersLoaded = true;
            if (this.map) {
                this.renderMarkers().then(() => {
                    this.filterPolygons(); // Filter polygons after markers load
                });
            }
        }
    }

    get markersExist() {
        return this.markers && this.markers.length > 0;
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

        // Render markers and shapefile together
        await Promise.all([this.renderMarkers(), this.renderShapefile()]);

        // Dispatch custom event to notify the map is initialized
        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));

        // Check and filter polygons after both resources are loaded
        this.filterPolygons();
    }

    async renderMarkers() {
        // Clear existing markers
        if (this.markerLayer) {
            this.map.removeLayer(this.markerLayer);
        }

        // Define custom icon for the markers
        const customIcon = L.icon({
            iconUrl: 'https://www.trustindiana.in.gov/wp-content/uploads/2018/06/School-Icon-300x300@2x.png',
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

        // Auto fit bounds if enabled
        if (this.autoFitBounds && this.markersExist) {
            this.map.flyToBounds(this.bounds, { padding: FIT_BOUNDS_PADDING });
        }

        this.markersLoaded = true; // Mark markers as loaded
    }

    async renderShapefile() {
        try {
            const shapefileUrl = SCHOOLDISTRICTS_ZIP;

            // Fetch and parse the shapefile
            const response = await fetch(shapefileUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch shapefile: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const geojson = await shp(arrayBuffer); // Parse shapefile into GeoJSON

            // Add GeoJSON to the map
            this.geoJsonLayer = L.geoJSON(geojson, {
                style: function (feature) {
                    return {
                        color: '#CC5500',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.5
                    };
                },
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        layer.bindPopup(this.generatePopupContent(feature.properties), { maxHeight: 200 });
                    }
                }
            }).addTo(this.map);

            // Fit map bounds to GeoJSON
            if (this.autoFitBounds) {
                const bounds = this.geoJsonLayer.getBounds();
                if (bounds.isValid()) {
                    this.map.fitBounds(bounds);
                }
            }

            this.shapefileLoaded = true; // Mark shapefile as loaded
        } catch (error) {
            console.error('Error loading or parsing shapefile:', error);
        }
    }

filterPolygons() {
    // Ensure both markers and shapefile are loaded
    if (!this.shapefileLoaded || !this.markersLoaded) {
        console.warn('Shapefile or markers not yet loaded!');
        return;
    }

    if (this.geoJsonLayer) {
        const markerLatLngs = this.markers.map(marker => L.latLng(marker.lat, marker.lng));

        // Iterate through each feature in the GeoJSON layer
        this.geoJsonLayer.eachLayer(layer => {
            // Ensure the layer is a polygon with valid bounds
            if (layer instanceof L.Polygon && layer.getBounds) {
                const polygonBounds = layer.getBounds();

                // Check if any marker falls inside the polygon bounds
                const hasMarkerInside = markerLatLngs.some(latlng => polygonBounds.contains(latlng));

                // Hide the polygon if no markers are inside
                if (!hasMarkerInside) {
                    console.log('Hiding polygon:', layer);
                    layer.setStyle({ fillOpacity: 0, opacity: 0 }); // Hide the polygon
                }
            } else {
                console.warn('Skipping non-polygon layer:', layer);
            }
        });
    } else {
        console.error('GeoJSON layer not found!');
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
}
