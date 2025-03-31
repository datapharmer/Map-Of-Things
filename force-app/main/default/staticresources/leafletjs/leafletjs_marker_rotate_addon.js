/*
 * Revised Marker Rotate Add-on
 *
 * This version uses safe API calls (style.setProperty) instead of appending to the inline style string.
 * It also checks that window.L exists before installing the modifications.
 */
(function () {
    // Only run if Leaflet is defined.
    if (!window.L) {
        return;
    }
    
    // Cache the original _setPos implementation.
    var origSetPos = L.Marker.prototype._setPos;
    
    L.Marker.include({
        // Helper: update the inline image transform using safe methods.
        _updateImg: function(img, iconAnchor, iconSize) {
            // Compute the offset (half the icon size minus the anchor)
            var anchorPoint = L.point(iconAnchor);
            var sizePoint = L.point(iconSize);
            var offset = sizePoint.divideBy(2).subtract(anchorPoint);
            
            // Build the transform string: first translate by -offset, then rotate, then translate back.
            var transform =
                'translate(' + (-offset.x) + 'px, ' + (-offset.y) + 'px) ' +
                'rotate(' + this.options.iconAngle + 'deg) ' +
                'translate(' + offset.x + 'px, ' + offset.y + 'px)';
            
            // Instead of appending to the existing transform string, set it directly.
            if (img.style) {
                img.style.setProperty('transform', transform);
            }
        },
        
        // Public method to set the icon angle.
        setIconAngle: function (angle) {
            this.options.iconAngle = angle;
            if (this._map) {
                this.update();
            }
        },
        
        // Overridden _setPos; removes any prior transform and then applies our custom one if needed.
        _setPos: function (pos) {
            if (this._icon) {
                this._icon.style.removeProperty('transform');
            }
            if (this._shadow) {
                this._shadow.style.removeProperty('transform');
            }
            
            origSetPos.call(this, pos);
            
            // If an angle is specified, update the icon and shadow images.
            if (this.options.iconAngle && this._icon) {
                var defaultIcon = new L.Icon.Default();
                var iconOpts = this.options.icon.options || {};
                var iconAnchor = iconOpts.iconAnchor || defaultIcon.options.iconAnchor;
                var iconSize = iconOpts.iconSize || defaultIcon.options.iconSize;
                
                this._updateImg(this._icon, iconAnchor, iconSize);
                
                // Rotate the shadow, if present.
                if (this._shadow && iconOpts.shadowSize) {
                    var shadowAnchor = iconOpts.shadowAnchor || iconAnchor;
                    var shadowSize = iconOpts.shadowSize;
                    this._updateImg(this._shadow, shadowAnchor, shadowSize);
                }
            }
        }
    });
}());
