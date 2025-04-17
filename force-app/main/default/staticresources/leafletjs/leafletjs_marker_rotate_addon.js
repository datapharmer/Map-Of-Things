/*
 * Modified Leaflet Marker Rotation Addon for Salesforce LWC
 * Works within Lightning Web Security constraints
 */
(function () {
    if (typeof L === 'undefined') return;
    
    // Store original _setPos method
    var _old__setPos = L.Marker.prototype._setPos;
    
    L.Marker.include({
        _updateImg: function(i, a, s) {
            try {
                a = L.point(s).divideBy(2)._subtract(L.point(a));
                var transform = '';
                transform += ' translate(' + -a.x + 'px, ' + -a.y + 'px)';
                transform += ' rotate(' + this.options.iconAngle + 'deg)';
                transform += ' translate(' + a.x + 'px, ' + a.y + 'px)';
                
                // Use L.DomUtil.setTransform which is LWS-compliant
                L.DomUtil.setTransform(i, transform);
            } catch(e) {
                console.warn('Marker rotation error:', e);
            }
        },

        setIconAngle: function (iconAngle) {
            this.options.iconAngle = iconAngle;
            if (this._map) {
                this.update();
            }
        },

        _setPos: function (pos) {
            try {
                // Reset transforms using L.DomUtil
                if (this._icon) {
                    L.DomUtil.setTransform(this._icon, '');
                }
                if (this._shadow) {
                    L.DomUtil.setTransform(this._shadow, '');
                }

                // Call original _setPos
                _old__setPos.apply(this, [pos]);

                if (this.options.iconAngle) {
                    var defaultIcon = new L.Icon.Default();
                    var a = this.options.icon.options.iconAnchor || defaultIcon.options.iconAnchor;
                    var s = this.options.icon.options.iconSize || defaultIcon.options.iconSize;
                    
                    if (this._icon) {
                        this._updateImg(this._icon, a, s);
                    }
                    if (this._shadow && this.options.icon.options.shadowAnchor) {
                        a = this.options.icon.options.shadowAnchor;
                        s = this.options.icon.options.shadowSize;
                        this._updateImg(this._shadow, a, s);
                    }
                }
            } catch(e) {
                console.warn('Marker position error:', e);
            }
        }
    });
})();
