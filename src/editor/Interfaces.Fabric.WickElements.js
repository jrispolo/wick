/* Wick - (c) 2017 Zach Rispoli, Luca Damasco, and Josh Rispoli */

/*  This file is part of Wick. 
    
    Wick is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    Wick is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    You should have received a copy of the GNU General Public License
    along with Wick.  If not, see <http://www.gnu.org/licenses/>. */
    
var FabricWickElements = function (wickEditor, fabricInterface) {

    var that = this;

    var objectsInCanvas = [];

    var cachedFabricObjects = {};

    var currentFrameRef;

    this.update = function () {
        var newFrameRef = wickEditor.project.getCurrentFrame();
        var onNewFrame = newFrameRef !== currentFrameRef;
        currentFrameRef = newFrameRef;

        var enablePerfTests = false;

        if(enablePerfTests) console.log("-------------------");
        if(enablePerfTests) startTiming();
        if(enablePerfTests) stopTiming("init");

        var currentObject = wickEditor.project.currentObject;
        var currentFrame = currentFrameRef;

        // Make sure everything is deselected, mulitple selected objects cause positioning problems.
        fabricInterface.deselectAll(true);

        var activeObjects = currentObject.getAllActiveChildObjects();
        if(wickEditor.paper.isActive()) {
            activeObjects = activeObjects.filter(function (obj) {
                return !obj.isPath;
            }); 
        }

        var siblingObjects = currentObject.getAllInactiveSiblings();
        var nearbyObjects = wickEditor.project.onionSkinning ? wickEditor.project.currentObject.getNearbyObjects(1,1) : [];
        var allObjects = nearbyObjects.concat(siblingObjects.concat(activeObjects));
        //var allObjects = siblingObjects.concat(activeObjects);

        var finish = function () {
            // Reselect objects that were selected before sync
            var selectedObjects = wickEditor.project.getSelectedObjects();
            fabricInterface.deselectAll();
            fabricInterface.selectObjects(selectedObjects);

            for(var i = 0; i < allObjects.length; i++) {
                allObjects[i]._zindex = i;
            }
            var fabObjs = [];
            fabricInterface.canvas._objects.forEach(function (obj) {
                fabObjs.push(obj);
            });
            fabObjs.forEach(function (fabObj) {
                var wickObj = fabObj.wickObjectRef;
                if(!wickObj) return;

                var gec = fabricInterface.guiElements.getNumGUIElements();
                fabricInterface.canvas.moveTo(fabObj, wickObj._zindex+gec, true);
            });


            /*console.log("Model:")
            allObjects.forEach(function (obj) {
                console.log("  " + obj.getTypeString() + " " + obj.uuid.substring(0,2));
            });
            console.log("View:")
            fabricInterface.canvas._objects.forEach(function (obj) {
                if(obj.wickObjectRef) {
                    console.log("  " + obj.wickObjectRef.getTypeString() + " " + obj.wickObjectRef.uuid.substring(0,2));
                } else {
                    console.log("  " + obj.identifier);
                }
            })
            console.log("")*/

            fabricInterface.canvas.renderAll();
        }

        if(enablePerfTests) stopTiming("object list generation");

        // Remove objects that don't exist anymore or need to be regenerated
        var removeTheseObjs = [];
        fabricInterface.canvas._objects.forEach(function(fabricObj) {
            if(!fabricObj || !fabricObj.wickObjectRef) return;

            var wickObj = fabricObj.wickObjectRef;

            if(allObjects.indexOf(fabricObj.wickObjectRef) == -1 || (wickObj && wickObj.forceFabricCanvasRegen)) {
                if(wickObj) {
                    wickObj.getAllChildObjectsRecursive().forEach(function (child) {
                        cachedFabricObjects[child.uuid] = null;
                    });
                    wickObj.forceFabricCanvasRegen = false;
                    cachedFabricObjects[wickObj.uuid] = null;
                }
                objectsInCanvas.splice(objectsInCanvas.indexOf(fabricObj.wickObjectRef), 1);
                // Object doesn't exist in the current object anymore, remove it's fabric object.
                removeTheseObjs.push(fabricObj);
            }
        });
        removeTheseObjs.forEach(function (fabricObj) {
            if(fabricObj.type === "group") {
                fabricObj.forEachObject(function(o){ 
                    fabricObj.removeWithUpdate(o);
                });
                fabricInterface.canvas.remove(fabricObj);
                //fabricInterface.canvas.renderAll();
            } else {
                fabricObj.remove();
            }
        });

        if(enablePerfTests) stopTiming("remove objects");

        var objectsToAdd = [];

        // Add new objects and update existing objects
        allObjects.forEach(function (child) {
            if(objectsInCanvas.indexOf(child) !== -1) {
                // Update existing object
                fabricInterface.canvas.forEachObject(function(fabricObj) {
                    if(fabricObj.group) return;
                    if(fabricObj.wickObjectRef === child) {
                        updateFabObjPositioning(fabricObj, child);
                        updateFabricObjectEvents(fabricObj, child, activeObjects, siblingObjects, nearbyObjects);
                    }
                });
                
            } else {
                // Add new object
                objectsInCanvas.push(child);
                objectsToAdd.push(child);
            }
        });

        var numObjectsAdded = 0;
        objectsToAdd.forEach(function (objectToAdd) {
            createFabricObjectFromWickObject(objectToAdd, function (fabricObj) {
                
                // The object may have been deleted while we were generating the fabric object. 
                // Make sure we don't add it if that happened.
                var newAllObjects = wickEditor.project.currentObject.getAllActiveChildObjects().concat(currentObject.getNearbyObjects(1,1));
                if(newAllObjects.indexOf(objectToAdd) === -1) {
                    objectsInCanvas.splice(objectsInCanvas.indexOf(objectToAdd), 1)
                    return;
                }

                objectToAdd.fabricObjectReference = fabricObj;

                fabricObj.originX = 'center';
                fabricObj.originY = 'center';

                fabricObj.wickObjectRef = objectToAdd;
                fabricInterface.canvas.add(fabricObj);

                if(fabricObj.type === "path") {
                    // do this here to prevent flickering when you draw a path with fabric
                    wickEditor.fabric.canvas.clearContext(wickEditor.fabric.canvas.contextTop);
                }
                updateFabObjPositioning(fabricObj, objectToAdd);
                updateFabricObjectEvents(fabricObj, objectToAdd, activeObjects, siblingObjects, nearbyObjects);

                //var trueZIndex = allObjects.indexOf(objectToAdd);
                //fabricInterface.canvas.moveTo(fabricObj, trueZIndex+fabricInterface.guiElements.getNumGUIElements());

                numObjectsAdded++;
                if(numObjectsAdded === objectsToAdd.length) {
                    //fabricInterface.canvas.renderAll()
                    finish();
                }
            });
        });

        if(objectsToAdd.length === 0) {
            finish();
        }

        if(enablePerfTests) stopTiming("add & update objects");
    }

    var createFabricObjectFromWickObject = function (wickObj, callback) {

        if(cachedFabricObjects[wickObj.uuid]) {
            //callback(cachedFabricObjects[wickObj.uuid]);
            //return;
        }
        
        if(wickObj.isImage) {
            /*var asset = wickEditor.project.library.getAsset(wickObj.assetUUID);
            fabric.util.loadImage('/resources/editor.png'/, function(img) {
                var pattern = new fabric.Pattern({
                    source: img,
                    repeat: 'repeat'
                });
                var rect = new fabric.Rect({
                    //left: 100,
                    //top: 100,
                    width: 100,
                    height: 100,
                    fill: pattern
                });
                callback(rect);
            });*/

            var asset = wickEditor.project.library.getAsset(wickObj.assetUUID);
            if(!asset) return;
            fabric.Image.fromURL(asset.getData(), function(newFabricImage) {
                cachedFabricObjects[wickObj.uuid] = newFabricImage;
                newFabricImage.wickObjReference = wickObj;
                callback(newFabricImage);
            });
        }

        if(wickObj.textData) {
            var newFabricText = new fabric.IText(wickObj.textData.text, wickObj.textData);
            newFabricText.wickObjReference = wickObj;
            callback(newFabricText);
        }

        if(wickObj.isSound) {
            fabric.Image.fromURL('resources/audio.png', function(audioFabricObject) {
                audioFabricObject.wickObjReference = wickObj;
                callback(audioFabricObject);
            });
        }
        
        if(wickObj.pathData) {
            fabric.loadSVGFromString(wickObj.pathData, function(objects, options) {
                var pathFabricObj = objects[0];

                // Workaround for buggy fabric.js SVG opacity
                if(!wickObj.paper) wickEditor.paper.pathRoutines.regenPaperJSState(wickObj)
                if(wickObj.paper && wickObj.paper.fillColor) pathFabricObj.fill = wickObj.paper.fillColor.toCSS()

                cachedFabricObjects[wickObj.uuid] = pathFabricObj;
                pathFabricObj.wickObjReference = wickObj;
                callback(pathFabricObj);
            });
        }

        if (wickObj.isSymbol) {
            wickObj.playheadPosition = 0;

            var children = wickObj.getAllActiveChildObjects();
            var group = new fabric.Group();
            var wos = {};

            if(children.length === 0) {
                var rect = new fabric.Rect({
                    left: 0,
                    top: 0,
                    fill: 'cyan',
                    opacity: 0.3,
                    width: 10,
                    height: 10,
                    originX: 'centerX',
                    originY: 'centerY',
                });
                group.addWithUpdate(rect);

                callback(group);
            }

            for(var i = 0; i < children.length; i++) {
                
                var setupSymbol = function () {
                    for(var i = 0; i < Object.keys(wos).length; i++) {
                        var pair = wos[i]
                        var fabricObj = pair.fo;
                        var child = pair.wo;

                        //fabricObj.originX = 'centerX';
                        //fabricObj.originY = 'centerY';
                        
                        updateFabObjPositioning(fabricObj, child);
                        //group.addWithUpdate(fabricObj);
                    }

                    var boxWidth = 0;
                    var boxHeight = 0;
                    children.forEach(function (child) {
                        var bbox = child.fabricObjectReference.getBoundingRect();
                        var bboxXY = wickEditor.fabric.screenToCanvasSpace(bbox.left, bbox.top);
                        var bboxSize = {x:bbox.width, y:bbox.height}//wickEditor.fabric.screenToCanvasSize(bbox.width, bbox.height);
                        bbox.left = bboxXY.x;
                        bbox.top = bboxXY.y;
                        bbox.width = bboxSize.x;
                        bbox.height = bboxSize.y;
                        child.bbox = bbox;
                        
                        if(child.x > 0) {
                            boxWidth  = Math.max(child.x + child.bbox.width/2,  boxWidth);
                        } else {
                            boxWidth  = Math.max(Math.abs(-child.x + child.bbox.width/2),  boxWidth);
                        }
                        if(child.y > 0) {
                            boxHeight = Math.max(child.y + child.bbox.height/2, boxHeight);
                        } else {
                            boxHeight = Math.max(Math.abs(-child.y + child.bbox.height/2), boxHeight);
                        }
                    });
                    //console.log(boxWidth)
                    //console.log(boxHeight)
                    var rect = new fabric.Rect({
                        left: wickObj.getAbsolutePosition().x,
                        top: wickObj.getAbsolutePosition().y,
                        fill: 'red',
                        opacity: 0,
                        width: boxWidth*2,
                        height: boxHeight*2,
                        originX: 'centerX',
                        originY: 'centerY',
                    });
                    group.addWithUpdate(rect);

                    //wos.forEach(function (pair) {
                    for(var i = 0; i < Object.keys(wos).length; i++) {
                        var pair = wos[i]
                        var fabricObj = pair.fo;
                        var child = pair.wo;

                        fabricObj.originX = 'centerX';
                        fabricObj.originY = 'centerY';
                        
                        //updateFabObj(fabricObj, child);
                        group.addWithUpdate(fabricObj);
                    }
                    wickObj.width = group.width;
                    wickObj.height = group.height;
                    group.wickObjReference = wickObj;
                    
                    var circle = new fabric.Circle({ 
                        radius: 6, 
                        fill: '', 
                        stroke: '#91BAFF', 
                        left: wickObj.getAbsolutePosition().x,
                        top: wickObj.getAbsolutePosition().y,
                        originX: 'centerX',
                        originY: 'centerY',
                    });
                    group.centerpointObject = circle;
                    if(wickObj.parentObject === wickEditor.project.currentObject) group.addWithUpdate(circle);
                    group.setCoords();
                    
                    callback(group);
                }
                var dothing = function (wo) {
                    createFabricObjectFromWickObject(children[wo], function(fabricObj) {
                        wos[wo] = ({fo:fabricObj,wo:children[wo]});

                        if(Object.keys(wos).length == children.length) {
                            setupSymbol();
                        }
                    });
                }
                dothing(i);
            }
        }

    }

    var updateFabObjPositioning = function (fabricObj, wickObj) {

        wickObj.fabricObjectReference = fabricObj;

        wickObj.svgWidth = fabricObj.getBoundingRectWidth();
        wickObj.svgHeight = fabricObj.getBoundingRectHeight();
        wickObj.svgStrokeWidth = fabricObj.strokeWidth || 0;

        // Some wick objects don't have a defined width/height until rendered by fabric. (e.g. paths and text)
        if(!wickObj.width) wickObj.width = fabricObj.width;
        if(!wickObj.height) wickObj.height = fabricObj.height;

        // Always use length of text from fabric
        if(fabricObj.type === "i-text") {
            wickObj.width  = fabricObj.width;
            wickObj.height  = fabricObj.height;
        }

        fabricObj.left    = wickObj.getAbsolutePosition().x;
        fabricObj.top     = wickObj.getAbsolutePosition().y;
        fabricObj.width   = wickObj.width;
        fabricObj.height  = wickObj.height;
        fabricObj.scaleX  = wickObj.scaleX;
        fabricObj.scaleY  = wickObj.scaleY;
        fabricObj.angle   = wickObj.rotation;
        fabricObj.flipX   = wickObj.flipX;
        fabricObj.flipY   = wickObj.flipY;
        fabricObj.opacity = wickObj.opacity;

        if(wickObj.textData) {
            fabricObj.text = wickObj.textData.text;
            fabricObj.fontFamily = wickObj.textData.fontFamily;
            fabricObj.setColor(wickObj.textData.fill);
            fabricObj.fontSize = wickObj.textData.fontSize;
            fabricObj.fontStyle = wickObj.textData.fontStyle;
            fabricObj.fontWeight = wickObj.textData.fontWeight;
            fabricObj.textDecoration = wickObj.textData.textDecoration;
            fabricObj.textAlign = wickObj.textData.textAlign;
        } else {
            if(wickObj.opacity > 0) {
                fabricObj.perPixelTargetFind = true;
                fabricObj.targetFindTolerance = 4;
            } else {
                fabricObj.perPixelTargetFind = false;
            }
        }

        fabricObj.setCoords();

        var bbox = fabricObj.getBoundingRect();
        var bboxXY = wickEditor.fabric.screenToCanvasSpace(bbox.left, bbox.top);
        var bboxSize = wickEditor.fabric.screenToCanvasSize(bbox.width, bbox.height);
        bbox.left = bboxXY.x;
        bbox.top = bboxXY.y;
        bbox.width = bboxSize.x;
        bbox.height = bboxSize.y;
        wickObj.bbox = bbox;

    }

    var updateFabricObjectEvents = function (fabricObj, wickObj, activeObjects, siblingObjects, nearbyObjects) {
        var setCoords = fabricObj.setCoords.bind(fabricObj);
        /*fabricObj.on({
            moving: setCoords,
            scaling: setCoords,
            rotating: setCoords
        });*/

        if(activeObjects.includes(wickObj)) {
            fabricObj.opacity = wickObj.opacity;
        } else {
            fabricObj.opacity = wickObj.opacity/2;
        }

        // Objects that are onion skins or that are not part of the current symbol being edited cannot be interacted with
        if(activeObjects.indexOf(wickObj) !== -1) {
            fabricObj.hasControls = true;
            fabricObj.selectable = true;
            fabricObj.evented = true;
        } else {
            fabricObj.hasControls = false;
            fabricObj.selectable = false;
            fabricObj.evented = false;
        }

        // Tools other than the cursor can't select objects
        if (!(wickEditor.currentTool instanceof Tools.Cursor)) {
            fabricObj.hasControls = false;
            fabricObj.selectable = false;
            fabricObj.evented = false;
        }

        if(wickObj.isSound) {
            fabricObj.hasControls = false;
        }

    }
    
}