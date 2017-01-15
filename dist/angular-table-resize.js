angular.module("ngTableResize", []);

angular.module("ngTableResize").directive('resizable', ['resizeStorage', '$injector', function(resizeStorage, $injector) {

    function controller() {
        this.columns = []
        this.resizer = getResizer(this)
        console.log("Resizer", this.resizer);
        var cache = resizeStorage.loadTableSizes(this.id, this.mode)

        this.addColumn = function(column) {
            this.columns.push(column)
        }

        this.finish = function() {
            console.log("Finish!");
            console.log("Container", this.container);
            console.log("Columns", this.getColumns());
            //this.resizer.setup(this.container, this.getColumns())
        }

        this.getColumns = function() {
            return this.columns.map(function(column) {
                return column.element
            })
        }

        this.removeColumn = function(column) {
            var index = this.columns.indexOf(column)
            if (index > -1) {
                this.columns.splice(index, 1);
            }
        }

        this.getStoredWidth = function(column) {
            return cache[column.resize] || 'auto';
        }

        this.saveColumnSizes = function() {
            var self = this
            if (!cache) cache = {};
            this.columns.forEach(function(column) {
                cache[column.resize] = self.resizer.saveAttr(column.element);
            })

            resizeStorage.saveTableSizes(this.id, this.mode, cache);
        }

        this.nextColumn = function(column) {
            var index = this.columns.indexOf(column)
            if (index === -1 || index >= this.columns.length) {
                return undefined
            } else {
                return this.columns[index + 1]
            }
        }

    }

    function compile(element, attr) {
        element.addClass('resize')
        return link
    }

    function link(scope, element, attr, ctrl) {
        // // Set global reference to table
        ctrl.table = $(element)
        //
        // Set global reference to container
        ctrl.container = ctrl.container ? $(ctrl.container) : element.parent();
        //
        // // Add css styling/properties to table
        // $(table).addClass('resize');
        //
        // // Initialise handlers, bindings and modes
        // initialiseAll(table, attr, scope);
        //
        // // Bind utility functions to scope object
        // bindUtilityFunctions(table, attr, scope)
        //
        // // Watch for mode changes and update all
        // watchModeChange(table, attr, scope);
    }

    function bindUtilityFunctions(table, attr, scope) {
        if (scope.bind === undefined) return;
        scope.bind = {
            update: function() {
                cleanUpAll(table);
                initialiseAll(table, attr, scope);
            }
        }
    }

    function watchModeChange(table, attr, scope) {
        scope.$watch(function() {
            return scope.mode;
        }, function(/*newMode*/) {
            cleanUpAll(table);
            initialiseAll(table, attr, scope);
        });
    }

    function cleanUpAll(table) {
        isFirstDrag = true;
        deleteHandles(table);
    }

    function resetTable(table) {
        $(table).outerWidth('100%');
        $(table).find('th').width('auto');
    }

    function deleteHandles(table) {
        $(table).find('th').find('.handle').remove();
    }

    function initialiseAll(table, attr, scope) {
        // Get all column headers
        columns = $(table).find('th');

        mode = scope.mode;

        // Get the resizer object for the current mode
        var ResizeModel = getResizer(scope, attr);
        if (!ResizeModel) return;
        resizer = new ResizeModel(table, columns, container);

        // Load column sized from saved storage
        cache = resizeStorage.loadTableSizes(table, scope.mode)

        // Decide which columns should have a handler attached
        handleColumns = resizer.handles(columns);

        // Decide which columns are controlled and resized
        ctrlColumns = resizer.ctrlColumns;

        // Execute setup function for the given resizer mode
        resizer.setup();

        // Set column sizes from cache
        setColumnSizes(cache);

        // Initialise all handlers for every column
        handleColumns.each(function(index, column) {
            initHandle(table, column);
        })

    }

    function setColumnSizes(cache) {
        if (!cache) {
            resetTable(table);
            return;
        }

        $(table).width('auto');

        ctrlColumns.each(function(index, column){
            var id = $(column).attr('id');
            var cacheWidth = cache[id];
            $(column).css({ width: cacheWidth });
        })

        resizer.onTableReady();
    }

    function initHandle(table, column) {
        // Prepend a new handle div to the column
        var handle = $('<div>', {
            class: 'handle'
        });
        $(column).prepend(handle);

        // Make handle as tall as the table
        //$(handle).height($(table).height())

        // Use the middleware to decide which columns this handle controls
        var controlledColumn = resizer.handleMiddleware(handle, column)

        // Bind mousedown, mousemove & mouseup events
        bindEventToHandle(table, handle, controlledColumn);
    }

    function bindEventToHandle(table, handle, column) {

        // This event starts the dragging
        $(handle).mousedown(function(event) {
            if (isFirstDrag) {
                resizer.onFirstDrag(column, handle);
                resizer.onTableReady();
                isFirstDrag = false;
            }

            var optional = {}
            if (resizer.intervene) {
                optional = resizer.intervene.selector(column);
                optional.column = optional;
                optional.orgWidth = $(optional).width();
            }

            // Prevent text-selection, object dragging ect.
            event.preventDefault();

            // Change css styles for the handle
            $(handle).addClass('active');

            // Show the resize cursor globally
            $('body').addClass('table-resize');

            // Get mouse and column origin measurements
            var orgX = event.clientX;
            var orgWidth = $(column).width();

            // On every mouse move, calculate the new width
            $(window).mousemove(calculateWidthEvent(column, orgX, orgWidth, optional))

            // Stop dragging as soon as the mouse is released
            $(window).one('mouseup', unbindEvent(handle))

        })
    }

    function calculateWidthEvent(column, orgX, orgWidth, optional) {
        return function(event) {
            // Get current mouse position
            var newX = event.clientX;

            // Use calculator function to calculate new width
            var diffX = newX - orgX;
            var newWidth = resizer.calculate(orgWidth, diffX);

            // Use restric function to abort potential restriction
            if (resizer.restrict(newWidth)) return;

            // Extra optional column
            if (resizer.intervene){
                var optWidth = resizer.intervene.calculator(optional.orgWidth, diffX);
                if (resizer.intervene.restrict(optWidth)) return;
                $(optional).width(optWidth)
            }

            // Set size
            $(column).width(newWidth);
        }
    }

    function getResizer(scope) {
        try {
            var mode = scope.mode ? scope.mode : 'BasicResizer';
            var Resizer = $injector.get(mode)
            if (!Resizer) return;
            return new Resizer(scope);
        } catch (e) {
            console.error("The resizer "+ scope.mode +" was not found");
            return null;
        }
    }


    function unbindEvent(handle) {
        // Event called at end of drag
        return function( /*event*/ ) {
            $(handle).removeClass('active');
            $(window).unbind('mousemove');
            $('body').removeClass('table-resize');

            resizer.onEndDrag();

            saveColumnSizes();
        }
    }

    function saveColumnSizes() {
        if (!cache) cache = {};
        $(columns).each(function(index, column) {
            var id = $(column).attr('id');
            if (!id) return;
            cache[id] = resizer.saveAttr(column);
        })

        resizeStorage.saveTableSizes(table, mode, cache);
    }

    // Return this directive as an object literal
    return {
        restrict: 'A',
        priority: 0,
        compile: compile,
        controller: controller,
        controllerAs: 'rzctrl',
        bindToController: true,
        scope: {
            id: '@',
            mode: '=?',
            bind: '=?',
            container: '@?'
        }
    };

}]);

angular.module("ngTableResize").directive('resize', [function() {


    // Return this directive as a object literal
    return {
        restrict: 'A',
        compile: compile,
        require: '^^resizable',
        scope: true
    };

    function compile() {
        return {
            pre: prelink,
            post: postlink
        }
    }

    function prelink(scope, element, attr, ctrl) {
        scope.resize = scope.$eval(attr.resize)
        scope.isFirstDrag = true
        scope.element = element

        ctrl.addColumn(scope)

        scope.$on('$destroy', function() {
            ctrl.removeColumn(scope)
        });

        scope.$watch('width', function(newVal, oldVal) {
            scope.setWidth(newVal)
        })
    }

    function postlink(scope, element, attr, ctrl) {
        if (ctrl.resizer.handles(scope)) {
            initHandle(scope, ctrl, element)
        }

        scope.width = ctrl.getStoredWidth(scope)

        scope.setWidth = function(width) {
            element.css({ width: width })
        }

        scope.next = function() {
            return ctrl.nextColumn(scope)
        }

        scope.getWidth = function() {
            return scope.element.width()
        }

        if (scope.$last) {
            ctrl.finish()
        }

    }

    function initHandle(scope, ctrl, column) {
        // Prepend a new handle div to the column
        scope.handle = $('<div>', {
            class: 'handle'
        });
        column.prepend(scope.handle);

        // Use the middleware to decide which columns this handle controls
        scope.controlledColumn = ctrl.resizer.handleMiddleware(scope, ctrl.collumns)

        // Bind mousedown, mousemove & mouseup events
        bindEventToHandle(scope, ctrl);
    }

    function bindEventToHandle(scope, ctrl) {

        // This event starts the dragging
        $(scope.handle).mousedown(function(event) {
            if (scope.isFirstDrag) {
                ctrl.resizer.onFirstDrag();
                ctrl.resizer.onTableReady();
                scope.isFirstDrag = false;
            }

            var optional = {}
            if (ctrl.resizer.intervene) {
                optional = ctrl.resizer.intervene.selector(scope.controlledColumn);
                optional.column = optional;
                optional.orgWidth = optional.getWidth();
            }

            // Prevent text-selection, object dragging ect.
            event.preventDefault();

            // Change css styles for the handle
            $(scope.handle).addClass('active');

            // Show the resize cursor globally
            $('body').addClass('table-resize');

            // Get mouse and column origin measurements
            var orgX = event.clientX;
            var orgWidth = scope.element.width();

            // On every mouse move, calculate the new width
            $(window).mousemove(calculateWidthEvent(scope, ctrl, orgX, orgWidth, optional))

            // Stop dragging as soon as the mouse is released
            $(window).one('mouseup', unbindEvent(scope, ctrl, scope.handle))

        })
    }

    function calculateWidthEvent(scope, ctrl, orgX, orgWidth, optional) {
        return function(event) {
            // Get current mouse position
            var newX = event.clientX;

            // Use calculator function to calculate new width
            var diffX = newX - orgX;
            var newWidth = ctrl.resizer.calculate(orgWidth, diffX);
            // Use restric function to abort potential restriction
            if (ctrl.resizer.restrict(newWidth)) return;

            // Extra optional column
            if (ctrl.resizer.intervene){
                var optWidth = ctrl.resizer.intervene.calculator(optional.orgWidth, diffX);
                if (ctrl.resizer.intervene.restrict(optWidth)) return;
                optional.setWidth(optWidth)
            }

            // Set size
            scope.controlledColumn.setWidth(newWidth);
        }
    }

    function unbindEvent(scope, ctrl, handle) {
        // Event called at end of drag
        return function( /*event*/ ) {
            $(handle).removeClass('active');
            $(window).unbind('mousemove');
            $('body').removeClass('table-resize');

            ctrl.resizer.onEndDrag();
            ctrl.saveColumnSizes();
        }
    }

}]);

angular.module("ngTableResize").service('resizeStorage', ['$window', function($window) {

    var prefix = "ngColumnResize";

    this.loadTableSizes = function(table, model) {
        var key = getStorageKey(table, model);
        var object = $window.localStorage.getItem(key);
        return JSON.parse(object) || {};
    }

    this.saveTableSizes = function(table, model, sizes) {
        var key = getStorageKey(table, model);
        if (!key) return;
        var string = JSON.stringify(sizes);
        $window.localStorage.setItem(key, string)
    }

    function getStorageKey(table, mode) {
        if (!table) {
            console.error("Table has no id", table);
            return undefined;
        }
        return prefix + '.' + table + '.' + mode;
    }

}]);

angular.module("ngTableResize").factory("ResizerModel", [function() {

    function ResizerModel(rzctrl){
        this.minWidth = 25;
        this.ctrl = rzctrl
    }

    ResizerModel.prototype.setup = function() {
        // Hide overflow by default
        $(this.ctrl.container).css({
            overflowX: 'hidden'
        })
    }

    ResizerModel.prototype.onTableReady = function () {
        // Table is by default 100% width
        $(this.ctrl.table).outerWidth('100%');
    };

    ResizerModel.prototype.handles = function () {
        // By default all columns should be assigned a handle
        return this.ctrl.columns;
    };

    ResizerModel.prototype.ctrlColumns = function () {
        // By default all columns assigned a handle are resized
        return this.handleColumns;
    };

    ResizerModel.prototype.onFirstDrag = function () {
        // By default, set all columns to absolute widths
        $(this.ctrlColumns).forEach(function(column) {
            column.setWidth(column.getWidth());
        })
    };

    ResizerModel.prototype.handleMiddleware = function (column, columns) {
        // By default, every handle controls the column it is placed in
        return column;
    };

    ResizerModel.prototype.restrict = function (newWidth) {
        // By default, the new width must not be smaller that min width
        return newWidth < this.minWidth;
    };

    ResizerModel.prototype.calculate = function (orgWidth, diffX) {
        // By default, simply add the width difference to the original
        return orgWidth + diffX;
    };

    ResizerModel.prototype.onEndDrag = function () {
        // By default, do nothing when dragging a column ends
        return;
    };

    ResizerModel.prototype.saveAttr = function (column) {
        return $(column.element).outerWidth();
    };

    return ResizerModel;
}]);

angular.module("ngTableResize").factory("BasicResizer", ["ResizerModel", function(ResizerModel) {

    function BasicResizer(table, columns, container) {
        // Call super constructor
        ResizerModel.call(this, table, columns, container)

        // All columns are controlled in basic mode
        this.ctrlColumns = this.columns;

        this.intervene = {
            selector: interveneSelector,
            calculator: interveneCalculator,
            restrict: interveneRestrict
        }
    }

    // Inherit by prototypal inheritance
    BasicResizer.prototype = Object.create(ResizerModel.prototype);

    function interveneSelector(column) {
        return column.next()
    }

    function interveneCalculator(orgWidth, diffX) {
        return orgWidth - diffX;
    }

    function interveneRestrict(newWidth){
        return newWidth < 25;
    }

    BasicResizer.prototype.setup = function(container, columns) {
        // Hide overflow in mode fixed
        this.ctrl.container.css({
            overflowX: 'hidden'
        })

        // First column is auto to compensate for 100% table width
        this.ctrl.columns[0].setWidth('auto')
        // $(columns).first().css({
        //     width: 'auto'
        // });
    };

    BasicResizer.prototype.handles = function(column) {
        // Mode fixed does not require handler on last column
        return column.$last !== true
    };

    BasicResizer.prototype.onFirstDrag = function() {
        // Replace all column's width with absolute measurements
        this.ctrl.columns.forEach(function(column) {
            column.setWidth(column.getWidth());
        })
    };

    BasicResizer.prototype.onEndDrag = function () {
        console.log("Drag end!");
        // Calculates the percent width of each column
        console.log("Table", this.ctrl.table);
        var totWidth = $(this.ctrl.table).outerWidth();
        console.log("totwidth", totWidth);
        var totPercent = 0;

        console.log('Columns', this.ctrl.columns);

        this.ctrl.columns.forEach(function(column) {
            console.log('Column', $(column.element));
            var colWidth = $(column.element).outerWidth();
            console.log("Colwidth", colWidth);
            var percentWidth = colWidth / totWidth * 100 + '%';
            totPercent += (colWidth / totWidth * 100);
            console.log('Set column width', percentWidth);
            column.setWidth(percentWidth)
        })

    };

    BasicResizer.prototype.saveAttr = function (column) {
        return $(column)[0].style.width;
    };

    // Return constructor
    return BasicResizer;

}]);

angular.module("ngTableResize").factory("FixedResizer", ["ResizerModel", function(ResizerModel) {

    function FixedResizer(table, columns, container) {
        // Call super constructor
        ResizerModel.call(this, table, columns, container)

        this.fixedColumn = $(table).find('th').first();
        this.bound = false;
    }

    // Inherit by prototypal inheritance
    FixedResizer.prototype = Object.create(ResizerModel.prototype);

    FixedResizer.prototype.setup = function() {
        // Hide overflow in mode fixed
        $(this.container).css({
            overflowX: 'hidden'
        })

        // First column is auto to compensate for 100% table width
        $(this.columns).first().css({
            width: 'auto'
        });
    };

    FixedResizer.prototype.handles = function() {
        // Mode fixed does not require handler on last column
        return $(this.columns).not(':last')
    };

    FixedResizer.prototype.ctrlColumns = function() {
        // In mode fixed, all but the first column should be resized
        return $(this.columns).not(':first');
    };

    FixedResizer.prototype.onFirstDrag = function() {
        // Replace each column's width with absolute measurements
        $(this.ctrlColumns).each(function(index, column) {
            $(column).width($(column).width());
        })
    };

    FixedResizer.prototype.handleMiddleware = function (handle, column) {
        // Fixed mode handles always controll next neightbour column
        return $(column).next();
    };

    FixedResizer.prototype.restrict = function (newWidth) {
        if (this.bound) {
            if (newWidth < this.bound) {
                $(this.fixedColumn).width('auto');
                this.bound = false;
                return false;
            } else {
                return true;
            }
        } else if (newWidth < this.minWidth) {
            return true;
        } else if ($(this.fixedColumn).width() <= this.minWidth) {
            this.bound = newWidth;
            $(this.fixedColumn).width(this.minWidth);
            return true;
        }
    };

    FixedResizer.prototype.calculate = function (orgWidth, diffX) {
        // Subtract difference - neightbour grows
        return orgWidth - diffX;
    };

    // Return constructor
    return FixedResizer;

}]);

angular.module("ngTableResize").factory("OverflowResizer", ["ResizerModel", function(ResizerModel) {

    function OverflowResizer(table, columns, container) {
        // Call super constructor
        ResizerModel.call(this, table, columns, container)
    }

    // Inherit by prototypal inheritance
    OverflowResizer.prototype = Object.create(ResizerModel.prototype);


    OverflowResizer.prototype.setup = function() {
        // Allow overflow in this mode
        $(this.container).css({
            overflow: 'auto'
        });
    };

    OverflowResizer.prototype.onTableReady = function() {
        // For mode overflow, make table as small as possible
        $(this.table).width(1);
    };

    // Return constructor
    return OverflowResizer;

}]);
