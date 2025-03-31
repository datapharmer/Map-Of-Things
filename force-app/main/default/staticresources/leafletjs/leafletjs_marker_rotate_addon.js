(function () {
  // Only run if Leaflet is defined
  if (typeof L === 'undefined') return;
  
  var originalSetPos = L.Marker.prototype._setPos;
  
  L.Marker.include({
    _updateImg: function(element, anchor, size) {
      if (!element || !element.style) return;
      
      // Use a safer approach to calculate points
      var anchorPoint = L.point(anchor || [0, 0]);
      var sizePoint = L.point(size || [0, 0]);
      var offset = sizePoint.divideBy(2)._subtract(anchorPoint);
      
      // Build transform string safely
      var transforms = [];
      transforms.push('translate(' + (-offset.x) + 'px, ' + (-offset.y) + 'px)');
      
      if (this.options.iconAngle) {
        transforms.push('rotate(' + this.options.iconAngle + 'deg)');
      }
      
      transforms.push('translate(' + offset.x + 'px, ' + offset.y + 'px)');
      
      // Apply transform in a more browser-compatible way
      try {
        element.style.transform = transforms.join(' ');
      } catch (e) {
        console.warn('Failed to set transform:', e);
      }
    },

    setIconAngle: function (iconAngle) {
      this.options.iconAngle = iconAngle;
      if (this._map) this.update();
      return this;
    },

    _setPos: function (pos) {
      // Clear transforms first to prevent accumulation
      if (this._icon && this._icon.style) {
        this._icon.style.transform = '';
      }
      
      if (this._shadow && this._shadow.style) {
        this._shadow.style.transform = '';
      }
      
      // Call original implementation
      originalSetPos.call(this, pos);
      
      // Apply rotation if specified
      if (this.options.iconAngle) {
        try {
          var defaultIcon = new L.Icon.Default();
          var anchor = this.options.icon && this.options.icon.options.iconAnchor || 
                      defaultIcon.options.iconAnchor;
          var size = this.options.icon && this.options.icon.options.iconSize || 
                    defaultIcon.options.iconSize;
          
          if (this._icon) {
            this._updateImg(this._icon, anchor, size);
          }
          
          if (this._shadow) {
            var shadowAnchor = this.options.icon && this.options.icon.options.shadowAnchor || 
                              (this.options.icon && this.options.icon.options.iconAnchor) ||
                              defaultIcon.options.shadowAnchor;
            var shadowSize = this.options.icon && this.options.icon.options.shadowSize || 
                            defaultIcon.options.shadowSize;
            
            this._updateImg(this._shadow, shadowAnchor, shadowSize);
          }
        } catch (e) {
          console.warn('Error applying marker rotation:', e);
        }
      }
    }
  });
})();
