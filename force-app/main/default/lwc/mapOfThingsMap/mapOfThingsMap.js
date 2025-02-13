import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import SCHOOLDISTRICTS_ZIP from '@salesforce/resourceUrl/schooldistricts';

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const LEAFLETADDON_JS_URL = '/leafletjs_marker_rotate_addon.js';
const SHPFILE_JS_URL = '/leaflet.shpfile.js';
const SHP_JS_URL = '/shp.js';
const CATILINE_JS_URL = '/catiline.js';  // Make sure this path is correct
const MIN_ZOOM = 2;
const FIT_BOUNDS_PADDING = [20, 20];
const MAP_CONTAINER = 'div.inner-map-container';
const CUSTOM_EVENT_INIT = 'init';

export default class MapOfThingsMap extends LightningElement {
    map;
    _markers = [];
    markerLayer; // Declare markerLayer here

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
                this.renderMarkers(); //  render markers when they are set.
                // We *could* re-render the shapefile here, but it's more efficient
                // to do it once in connectedCallback, after markers are loaded.
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

        // Render shapefile *after* markers, so we can use the markers for filtering
        await this.renderShapefile();

        // Dispatch custom event to notify the map is initialized
        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
    }

    renderMarkers() {
        // Clear existing markers
        if (this.markerLayer) {
            this.map.removeLayer(this.markerLayer);
        }

        // Define custom icon for the markers
        const customIcon = L.icon({
            iconUrl: 'https://www.trustindiana.in.gov/wp-content/uploads/2018/06/School-Icon-300x300@2x.png', // Custom icon URL
            iconSize: [50, 50], // Adjust the size of the icon as needed
            iconAnchor: [25, 50] // Anchor point to properly position the icon on the map
        });

        // Create a layer group for the markers
        this.markerLayer = L.layerGroup(
            this.markers.map(marker => {
                return L.marker([marker.lat, marker.lng], {
                    icon: customIcon, // Use the custom icon
                    title: marker.title || '',
                    rotationAngle: marker.rotationAngle || 0 // Optional: if using the marker rotation addon
                }).bindPopup(marker.popupContent || '');
            })
        );

        // Add the marker layer to the map
        this.markerLayer.addTo(this.map);

        // Auto fit bounds if enabled
        if (this.autoFitBounds && this.markersExist) {
            this.map.flyToBounds(this.bounds, { padding: FIT_BOUNDS_PADDING });
        }
    }


    async renderShapefile() {
        try {
            const shapefileUrl = SCHOOLDISTRICTS_ZIP;

            // Fetch and parse the Shapefile
            const response = await fetch(shapefileUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch shapefile: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const geojson = await shp(arrayBuffer);

            // --- Intersection Logic ---
            const filteredFeatures = [];

            if (this.markersExist) {  // Only filter if markers exist
                for (const feature of geojson.features) {
                    const polygon = L.geoJSON(feature); // Create a temporary Leaflet layer for the polygon
                    for (const marker of this.markerLayer.getLayers()) { // Iterate through rendered markers
                        if (L.GeometryUtil.intersects(marker, polygon)) {
                            filteredFeatures.push(feature);
                            break; //  add the feature and move to the next
                        }
                    }
                }
            } else {
                // If no markers, show all features (or none, depending on your requirement)
                filteredFeatures.push(...geojson.features); // Show all
                // OR: filteredFeatures = [];  // Show none
            }


            // Create a new GeoJSON object with the filtered features
            const filteredGeoJSON = {
                type: "FeatureCollection",
                features: filteredFeatures
            };

            // Add GeoJSON to the map with styles
            const geoJsonLayer = L.geoJSON(filteredGeoJSON, {
                style: function (feature) {
                    return {
                        color: '#CC5500',  // Consistent color
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


            // Fit map bounds to GeoJSON *if* there are features
            if (this.autoFitBounds && filteredFeatures.length > 0) {
                const bounds = geoJsonLayer.getBounds();
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
}
