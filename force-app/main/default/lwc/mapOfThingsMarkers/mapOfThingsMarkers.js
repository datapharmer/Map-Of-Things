// deploy/lwc/mapOfThingsMarkers/mapOfThingsMarkers.js
import { LightningElement, api } from 'lwc';

export default class MapOfThingsMarkers extends LightningElement {
    // Internal storage for marker data.
    _markers = [];
    leafletMarkers = {};

    // Public accessor (only decorate the getter).
    @api
    get markers() {
        return this._markers;
    }

    set markers(newMarkers) {
        this._markers = newMarkers;
        // Create or update markers.
        newMarkers.forEach(newMarker => {
            if (this.leafletMarkers[newMarker.id]) {
                this.updateRotatingMarker(newMarker);
            } else {
                this.createRotatingMarker(newMarker);
            }
        });
        // Remove markers that are no longer in the newMarkers array.
        Object.keys(this.leafletMarkers).forEach(existingId => {
            if (!newMarkers.find(m => m.id === existingId)) {
                this.map.removeLayer(this.leafletMarkers[existingId].marker);
                delete this.leafletMarkers[existingId];
            }
        });
    }

    // Example API properties for configuring icon sizes and passing the Leaflet map.
    @api iconSizeX = 32;
    @api iconSizeY = 32;
    @api map;

    /**
     * Creates a new rotating marker using a custom approach without patching L.Marker.
     */
    createRotatingMarker(newMarker) {
        const { id, lat, lng, icon, popup } = newMarker;
        // Use a divIcon that wraps an <img> tag. Inline styles handle rotation.
        const html = `<img src="${icon}" 
                          style="width:${this.iconSizeX}px; height:${this.iconSizeY}px; 
                                 transform:rotate(0deg); 
                                 transition: transform 0.5s;"
                          alt="marker icon"/>`;
        const customIcon = L.divIcon({
            html,
            className: '', // optional: remove default marker styling if needed
            iconSize: [this.iconSizeX, this.iconSizeY],
            iconAnchor: [this.iconSizeX / 2, this.iconSizeY / 2],
            popupAnchor: [0, -(this.iconSizeY * 0.25)]
        });
        // Create the marker using the custom icon.
        const marker = L.marker([lat, lng], { icon: customIcon });
        marker.addTo(this.map).bindPopup(popup);
        // Store the marker with its current rotation angle (starting at 0 deg).
        this.leafletMarkers[id] = { marker, angle: 0 };
    }

    /**
     * Updates an existing rotating marker.
     */
    updateRotatingMarker(newMarker) {
        const { id, lat, lng, popup } = newMarker;
        const targetData = this.leafletMarkers[id];
        if (!targetData) {
            // If the marker does not exist, create it.
            this.createRotatingMarker(newMarker);
            return;
        }
        const { marker, angle: currentAngle } = targetData;
        // Update the marker's position.
        marker.setLatLng([lat, lng]);
        // Compute a new angle (for example, increment by 30 degrees).
        const newAngle = (currentAngle + 30) % 360;
        // Retrieve the marker's DOM element (the <img> inside the divIcon).
        const markerEl = marker.getElement()?.querySelector('img');
        if (markerEl) {
            markerEl.style.transform = `rotate(${newAngle}deg)`;
        }
        // Update popup content if needed.
        if (popup && marker.getPopup().getContent() !== popup) {
            marker.setPopupContent(popup);
        }
        // Save the new angle
        this.leafletMarkers[id].angle = newAngle;
    }
}
