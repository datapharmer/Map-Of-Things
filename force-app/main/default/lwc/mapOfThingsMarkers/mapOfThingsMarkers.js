// mapOfThingsMarkers.js
import { LightningElement, api } from 'lwc';

export default class MapOfThingsMarkers extends LightningElement {
    // Internal storage for markers data.
    _markers = [];
    leafletMarkers = {};

    // Public getter for markers.
    @api
    get markers() {
        // You could return the stored markers array,
        // or if needed, a transformed version (e.g. only returning something specific)
        return this._markers;
    }

    // Public setter for markers.
    @api
    set markers(newMarkers) {
        this._markers = newMarkers;
        // Process the incoming markers.
        newMarkers.forEach(newMarker => {
            if (this.leafletMarkers[newMarker.id]) {
                this.updateRotatingMarker(newMarker);
            } else {
                this.createRotatingMarker(newMarker);
            }
        });
        // Remove markers that are not in newMarkers.
        Object.keys(this.leafletMarkers).forEach(existingId => {
            if (!newMarkers.find(m => m.id === existingId)) {
                this.map.removeLayer(this.leafletMarkers[existingId].marker);
                delete this.leafletMarkers[existingId];
            }
        });
    }

    /**
     * Creates a new rotating marker using a custom approach without patching L.Marker.
     */
    createRotatingMarker(newMarker) {
        const { id, lat, lng, icon, popup } = newMarker;
        // Create a custom icon using L.divIcon that wraps an <img> tag.
        const html = `<img src="${icon}" 
                          style="width:${this.iconSizeX}px; height:${this.iconSizeY}px; 
                                 transform:rotate(0deg); 
                                 transition: transform 0.5s;"
                          alt="marker icon"/>`;
        const customIcon = L.divIcon({
            html,
            className: '', // optional: remove default styles if needed
            iconSize: [this.iconSizeX, this.iconSizeY],
            iconAnchor: [this.iconSizeX / 2, this.iconSizeY / 2],
            popupAnchor: [0, -(this.iconSizeY * 0.25)]
        });
        // Create the marker using the custom icon.
        const marker = L.marker([lat, lng], { icon: customIcon });
        marker.addTo(this.map).bindPopup(popup);
        // Store the marker and its current rotation angle (starting at 0).
        this.leafletMarkers[id] = { marker, angle: 0 };
    }

    /**
     * Updates an existing rotating marker.
     */
    updateRotatingMarker(newMarker) {
        const { id, lat, lng, icon, popup } = newMarker;
        const targetData = this.leafletMarkers[id];
        if (!targetData) {
            // If the marker does not exist, create it.
            this.createRotatingMarker(newMarker);
            return;
        }
        const { marker, angle: currentAngle } = targetData;
        // Update marker position.
        marker.setLatLng([lat, lng]);
        // Compute a new angle (example: simply increment by 30 degrees).
        const newAngle = (currentAngle + 30) % 360;
        // Retrieve the DOM element of the marker (<img> inside the divIcon).
        const markerEl = marker.getElement()?.querySelector('img');
        if (markerEl) {
            markerEl.style.transform = `rotate(${newAngle}deg)`;
        }
        // Update popup content if it has changed.
        if (popup && marker.getPopup().getContent() !== popup) {
            marker.setPopupContent(popup);
        }
        // Save the new angle.
        this.leafletMarkers[id].angle = newAngle;
    }
    
    // Example properties that the component might receive via @api.
    @api iconSizeX = 32;
    @api iconSizeY = 32;
    @api map;
}
