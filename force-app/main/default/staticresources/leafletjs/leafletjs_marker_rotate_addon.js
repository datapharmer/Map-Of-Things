/*
 * Modified for LWC compatibility and Firefox support
 */
(function () {
    // Wait for Leaflet to be available
    function initRotateAddon(L) {
        var _old__setPos = L.Marker.prototype._setPos;
        
        L.Marker.include({
            _updateImg: function(i, a, s) {
                a = L.point(s).divideBy(2)._subtract(L.point(a));
                var transform = '';
                transform += ' translate(' + -a.x + 'px, ' + -a.y + 'px)';
                transform += ' rotate(' + this.options.iconAngle + 'deg)';
                transform += ' translate(' + a.x + 'px, ' + a.y + 'px)';
                
                // Use Leaflet's DomUtil for safer style setting
                L.DomUtil.setStyle(i, 'transform', transform);
                L.DomUtil.setStyle(i, '-webkit-transform', transform);
            },

            setIconAngle: function (iconAngle) {
                this.options.iconAngle = iconAngle;
                if (this._map) {
                    this.update();
                }
            },

            _setPos: function (pos) {
                if (this._icon) {
                    L.DomUtil.setStyle(this._icon, 'transform', '');
                }
                if (this._shadow) {
                    L.DomUtil.setStyle(this._shadow, 'transform', '');
                }

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
            }
        });
    }

    // Check for Leaflet availability
    if (typeof L !== 'undefined') {
        initRotateAddon(L);
    } else {
        // Fallback for LWC
        window.addEventListener('DOMContentLoaded', function() {
            if (typeof L !== 'undefined') {
                initRotateAddon(L);
            }
        });
    }
})();
