/*global define*/
define([
        '../Core/defined',
        '../Core/defaultValue',
        '../Core/destroyObject',
        '../Core/Enumeration',
        '../Core/loadArrayBuffer',
        '../Core/loadText',
        '../Core/loadImage',
        '../Core/Queue',
        '../Core/Cartesian2',
        '../Core/Cartesian3',
        '../Core/Cartesian4',
        '../Core/Matrix4',
        '../Core/BoundingSphere',
        '../Core/IndexDatatype',
        '../Core/ComponentDatatype',
        '../Core/PrimitiveType',
        '../Renderer/TextureWrap',
        '../Renderer/TextureMinificationFilter',
        '../Renderer/TextureMagnificationFilter',
        '../Renderer/BufferUsage',
        '../Renderer/BlendingState',
        '../Renderer/DrawCommand',
        '../Renderer/createPickFragmentShaderSource',
        './SceneMode'
    ], function(
        defined,
        defaultValue,
        destroyObject,
        Enumeration,
        loadArrayBuffer,
        loadText,
        loadImage,
        Queue,
        Cartesian2,
        Cartesian3,
        Cartesian4,
        Matrix4,
        BoundingSphere,
        IndexDatatype,
        ComponentDatatype,
        PrimitiveType,
        TextureWrap,
        TextureMinificationFilter,
        TextureMagnificationFilter,
        BufferUsage,
        BlendingState,
        DrawCommand,
        createPickFragmentShaderSource,
        SceneMode) {
    "use strict";
// TODO: remove before merge to master
/*global console*/

    var ModelState = {
        NEEDS_LOAD : new Enumeration(0, 'NEEDS_LOAD'),
        LOADING : new Enumeration(1, 'LOADING'),
        LOADED : new Enumeration(2, 'LOADED')
    };

    function LoadResources() {
        this.bufferViewsToCreate = new Queue();
        this.buffers = {};
        this.pendingBufferLoads = 0;

        this.programsToCreate = new Queue();
        this.shaders = {};
        this.pendingShaderLoads = 0;

        this.texturesToCreate = new Queue();
        this.pendingTextureLoads = 0;

        this.createRenderStates = true;
    }

    LoadResources.prototype.finishedPendingLoads = function() {
        return ((this.pendingBufferLoads === 0) &&
                (this.pendingShaderLoads === 0) &&
                (this.pendingTextureLoads === 0));
    };

    LoadResources.prototype.finishedResourceCreation = function() {
        return ((this.bufferViewsToCreate.length === 0) &&
                (this.programsToCreate.length === 0) &&
                (this.texturesToCreate.length === 0));
    };

    LoadResources.prototype.finishedBufferViewsCreation = function() {
        return ((this.pendingBufferLoads === 0) && (this.bufferViewsToCreate.length === 0));
    };

    LoadResources.prototype.finishedTextureCreation = function() {
        return ((this.pendingTextureLoads === 0) && (this.texturesToCreate.length === 0));
    };

    /**
     * DOC_TBA
     *
     * @alias Model
     * @constructor
     */
    var Model = function(options) {
        options = defaultValue(options, defaultValue.EMPTY_OBJECT);

        /**
         * DOC_TBA
         */
        this.gltf = options.gltf;

        /**
         * DOC_TBA
         */
        this.basePath = defaultValue(options.basePath, '');

        /**
         * Determines if the model primitive will be shown.
         *
         * @type {Boolean}
         *
         * @default true
         */
        this.show = true;

        this._state = ModelState.NEEDS_LOAD;
        this._loadResources = undefined;
    };

    ///////////////////////////////////////////////////////////////////////////

    function failedLoad() {
        // TODO
    }

    function bufferLoad(model, name) {
        return function(arrayBuffer) {
            var loadResources = model._loadResources;
            loadResources.buffers[name] = arrayBuffer;
            --loadResources.pendingBufferLoads;
         };
    }

    function parseBuffers(model) {
        var buffers = model.gltf.buffers;
        for (var name in buffers) {
            if (buffers.hasOwnProperty(name)) {
                ++model._loadResources.pendingBufferLoads;
                var bufferPath = model.basePath + buffers[name].path;
                loadArrayBuffer(bufferPath).then(bufferLoad(model, name), failedLoad);
            }
        }
    }

    function parseBufferViews(model) {
        var bufferViews = model.gltf.bufferViews;
        for (var name in bufferViews) {
            if (bufferViews.hasOwnProperty(name)) {
                model._loadResources.bufferViewsToCreate.enqueue(name);
            }
        }
    }

    function shaderLoad(model, name) {
        return function(source) {
            var loadResources = model._loadResources;
            loadResources.shaders[name] = source;
            --loadResources.pendingShaderLoads;
         };
    }

    function parseShaders(model) {
        var shaders = model.gltf.shaders;
        for (var name in shaders) {
            if (shaders.hasOwnProperty(name)) {
                ++model._loadResources.pendingShaderLoads;
                var shaderPath = model.basePath + shaders[name].path;
                loadText(shaderPath).then(shaderLoad(model, name), failedLoad);
            }
        }
    }

    function parsePrograms(model) {
        var programs = model.gltf.programs;
        for (var name in programs) {
            if (programs.hasOwnProperty(name)) {
                model._loadResources.programsToCreate.enqueue(name);
            }
        }
    }

    function imageLoad(model, name) {
        return function(image) {
            var loadResources = model._loadResources;
            --loadResources.pendingTextureLoads;
            loadResources.texturesToCreate.enqueue({
                 name : name,
                 image : image
             });
         };
    }

    function parseImages(model) {
        var images = model.gltf.images;
        for (var name in images) {
            if (images.hasOwnProperty(name)) {
                ++model._loadResources.pendingTextureLoads;
                var imagePath = model.basePath + images[name].path;
                loadImage(imagePath).then(imageLoad(model, name), failedLoad);
            }
        }
    }

    function parse(model) {
        parseBuffers(model);
        parseBufferViews(model);
        parseShaders(model);
        parsePrograms(model);
        parseImages(model);
    }

    ///////////////////////////////////////////////////////////////////////////

    function createBuffers(model, context) {
        var loadResources = model._loadResources;

// TODO: more fine-grained bufferView-to-buffer dependencies
        if (loadResources.pendingBufferLoads !== 0) {
            return;
        }

        var raw;
        var bufferView;
        var bufferViews = model.gltf.bufferViews;
        var buffers = loadResources.buffers;

        while (loadResources.bufferViewsToCreate.length > 0) {
            var bufferViewName = loadResources.bufferViewsToCreate.dequeue();
            bufferView = bufferViews[bufferViewName];
            bufferView.extra = defaultValue(bufferView.extra, {});

            if (bufferView.target === 'ARRAY_BUFFER') {
                // Only ARRAY_BUFFER here.  ELEMENT_ARRAY_BUFFER created below.
                raw = new Uint8Array(buffers[bufferView.buffer], bufferView.byteOffset, bufferView.byteLength);
                var vertexBuffer = context.createVertexBuffer(raw, BufferUsage.STATIC_DRAW);
                vertexBuffer.setVertexArrayDestroyable(false);
                bufferView.extra.czmBuffer = vertexBuffer;
            }
        }

        // The Cesium Renderer requires knowing the datatype for an index buffer
        // at creation type, which is not part of the glTF bufferview so loop
        // through glTF indices to create the bufferview's index buffer.
        var indices = model.gltf.indices;
        for (var name in indices) {
            if (indices.hasOwnProperty(name)) {
                var instance = indices[name];
                bufferView = bufferViews[instance.bufferView];

                if (!defined(bufferView.extra.czmBuffer)) {
                    raw = new Uint8Array(buffers[bufferView.buffer], bufferView.byteOffset, bufferView.byteLength);
                    var indexBuffer = context.createIndexBuffer(raw, BufferUsage.STATIC_DRAW, IndexDatatype[instance.type]);
                    indexBuffer.setVertexArrayDestroyable(false);
                    bufferView.extra.czmBuffer = indexBuffer;
                    // In theory, several glTF indices with different types could
                    // point to the same glTF bufferView, which would break this.
                    // In practice, it is unlikely as it will be UNSIGNED_SHORT.
                }
            }
        }
    }

    function createPrograms(model, context) {
        var loadResources = model._loadResources;

// TODO: more fine-grained program-to-shader dependencies
        if (loadResources.pendingShaderLoads !== 0) {
            return;
        }

        var programs = model.gltf.programs;
        var shaders = loadResources.shaders;

        // Create one program per frame
        if (loadResources.programsToCreate.length > 0) {
            var name = loadResources.programsToCreate.dequeue();
            var program = programs[name];

            var vs = shaders[program.vertexShader];
            var fs = shaders[program.fragmentShader];
// TODO: glTF needs translucent flag so we know if we need its fragment shader.
            var pickFS = createPickFragmentShaderSource(fs, 'uniform');

            program.extra = defaultValue(program.extra, {});
            program.extra.czmProgram = context.getShaderCache().getShaderProgram(vs, fs);
            program.extra.czmPickProgram = context.getShaderCache().getShaderProgram(vs, pickFS);
// TODO: in theory, czmPickProgram could have a different set of attribute locations
        }
    }

    function createTextures(model, context) {
        var loadResources = model._loadResources;
        var images = model.gltf.images;

        // Create one texture per frame
        if (loadResources.texturesToCreate.length > 0) {
            var textureToCreate = loadResources.texturesToCreate.dequeue();

            var image = images[textureToCreate.name];
            image.extra = defaultValue(image.extra, {});
            image.extra.czmTexture = context.createTexture2D({
                source : textureToCreate.image,
                flipY : false
            });
// TODO: texture cache
        }
    }

    var gltfTypes = {
        FLOAT : {
            componentsPerAttribute : 1,
            componentDatatype : ComponentDatatype.FLOAT
        },
        FLOAT_VEC2 : {
            componentsPerAttribute : 2,
            componentDatatype : ComponentDatatype.FLOAT
        },
        FLOAT_VEC3 : {
            componentsPerAttribute : 3,
            componentDatatype : ComponentDatatype.FLOAT
        },
        FLOAT_VEC4 : {
            componentsPerAttribute : 4,
            componentDatatype : ComponentDatatype.FLOAT
        }
// TODO: add other types
    };

    function getSemanticToAttributeLocations(model, primitive) {
// TODO: this could be done per material, not per mesh, if we don't change glTF
        var gltf = model.gltf;
        var programs = gltf.programs;
        var techniques = gltf.techniques;
        var materials = gltf.materials;

        // Retrieve the compiled shader program to assign index values to attributes
        var semanticToAttributeLocations = {};

        var technique = techniques[materials[primitive.material].instanceTechnique.technique];
        var parameters = technique.parameters;
        var pass = technique.passes[technique.pass];
        var instanceProgram = pass.instanceProgram;
        var program = programs[instanceProgram.program];
        var attributes = instanceProgram.attributes;
        var attributeLocations = program.extra.czmProgram.getVertexAttributes();

        for (var name in attributes) {
            if (attributes.hasOwnProperty(name)) {
                var parameter = parameters[attributes[name]];

                semanticToAttributeLocations[parameter.semantic] = attributeLocations[name].index;
            }
        }

        return semanticToAttributeLocations;
    }

    function createVertexArrays(model, context) {
        var loadResources = model._loadResources;

// TODO: more fine-grained mesh-to-buffer-views dependencies
         if (!loadResources.finishedBufferViewsCreation()) {
             return;
         }

         var gltf = model.gltf;
         var bufferViews = gltf.bufferViews;
         var attributes = gltf.attributes;
         var indices = gltf.indices;
         var meshes = gltf.meshes;
         var name;

         for (name in meshes) {
             if (meshes.hasOwnProperty(name)) {
                 var primitives = meshes[name].primitives;

                 for (name in primitives) {
                     if (primitives.hasOwnProperty(name)) {
                         var primitive = primitives[name];

                         var semanticToAttributeLocations = getSemanticToAttributeLocations(model, primitive);
                         var attrs = [];
                         var semantics = primitive.semantics;
                         for (name in semantics) {
                             if (semantics.hasOwnProperty(name)) {
                                 var a = attributes[semantics[name]];

                                 var type = gltfTypes[a.type];
                                 attrs.push({
                                     index                  : semanticToAttributeLocations[name],
                                     vertexBuffer           : bufferViews[a.bufferView].extra.czmBuffer,
                                     componentsPerAttribute : type.componentsPerAttribute,
                                     componentDatatype      : type.componentDatatype,
// TODO: is normalize part of glTF attribute?
                                     normalize              : false,
                                     offsetInBytes          : a.byteOffset,
                                     strideInBytes          : a.byteStride
                                 });
                             }
                         }

                         var i = indices[primitive.indices];
                         var indexBuffer = bufferViews[i.bufferView].extra.czmBuffer;

                         primitive.extra = defaultValue(primitive.extra, {});
                         primitive.extra.czmVertexArray = context.createVertexArray(attrs, indexBuffer);
                     }
                 }
             }
         }
    }

    function createRenderStates(model, context) {
        var loadResources = model._loadResources;

        if (loadResources.createRenderStates) {
            loadResources.createRenderStates = false;

            var techniques = model.gltf.techniques;
            for (var name in techniques) {
                if (techniques.hasOwnProperty(name)) {
                    var technique = techniques[name];
                    var pass = technique.passes[technique.pass];
                    var states = pass.states;

                    states.extra = defaultValue(states.extra, {});
                    states.extra.czmRenderState = context.createRenderState({
                        cull : {
                            enabled : states.cullFaceEnable
                        },
                        depthTest : {
                            enabled : states.depthTestEnable
                        },
                        depthMask : states.depthMask,
                        blending : states.blendEnable ? BlendingState.ALPHA_BLEND : BlendingState.DISABLED
                    });
                }
            }
        }
    }

    var gltfSemanticUniforms = {
// TODO: All semantics
        WORLD : function(uniformState) {
            return function() {
                return uniformState.getModel();
            };
        },
        VIEW : function(uniformState) {
            return function() {
                return uniformState.getView();
            };
        },
        PROJECTION : function(uniformState) {
            return function() {
                return uniformState.getProjection();
            };
        },
        WORLDVIEW : function(uniformState) {
            return function() {
                return uniformState.getModelView();
            };
        },
        VIEWPROJECTION : function(uniformState) {
            return function() {
                return uniformState.getViewProjection();
            };
        },
        WORLDVIEWPROJECTION : function(uniformState) {
            return function() {
                return uniformState.getModelViewProjection();
            };
        },
        WORLDINVERSE : function(uniformState) {
            return function() {
                return uniformState.getInverseModel();
            };
        },
        VIEWINVERSE : function(uniformState) {
            return function() {
                return uniformState.getInverseView();
            };
        },
        PROJECTIONINVERSE : function(uniformState) {
            return function() {
                return uniformState.getInverseProjection();
            };
        },
        WORLDVIEWINVERSE : function(uniformState) {
            return function() {
                return uniformState.getInverseModelView();
            };
        },
        VIEWPROJECTIONINVERSE : function(uniformState) {
            return function() {
                return uniformState.getInverseViewProjection();
            };
        },
        WORLDVIEWINVERSETRANSPOSE : function(uniformState) {
            return function() {
                return uniformState.getNormal();
            };
        }
    };

    var gltfUniformFunctions = {
// TODO: All types
         FLOAT : function(value, model, context) {
             return function() {
                 return value;
             };
         },
         FLOAT_VEC2 : function(value, model, context) {
             var v = Cartesian2.fromArray(value);

             return function() {
                 return v;
             };
         },
         FLOAT_VEC3 : function(value, model, context) {
             var v = Cartesian3.fromArray(value);

             return function() {
                 return v;
             };
         },
         FLOAT_VEC4 : function(value, model, context) {
             var v = Cartesian4.fromArray(value);

             return function() {
                 return v;
             };
         },
         SAMPLER_2D : function(value, model, context) {
             var images = model.gltf.images;
             var texture = images[value.image].extra.czmTexture;

             texture.setSampler(context.createSampler({
                 wrapS : TextureWrap[value.wrapS],
                 wrapT : TextureWrap[value.wrapT],
                 minificationFilter : TextureMinificationFilter[value.minFilter],
                 magnificationFilter : TextureMagnificationFilter[value.magFilter]
             }));

             return function() {
                 return texture;
             };
         }
    };

    function createUniformMaps(model, context) {
        var loadResources = model._loadResources;

// TODO: more fine-grained texture dependencies
        if (!loadResources.finishedTextureCreation()) {
            return;
        }

        var name;
        var materials = model.gltf.materials;
        var techniques = model.gltf.techniques;

        for (name in materials) {
            if (materials.hasOwnProperty(name)) {
                var material = materials[name];
                var instanceTechnique = material.instanceTechnique;
                var technique = techniques[instanceTechnique.technique];
                var parameters = technique.parameters;
                var pass = technique.passes[technique.pass];
                var instanceProgram = pass.instanceProgram;
                var uniforms = instanceProgram.uniforms;

                var parameterValues = {};

                // Uniform parameters for this pass
                for (name in uniforms) {
                    if (uniforms.hasOwnProperty(name)) {
                        var parameterName = uniforms[name];
                        var parameter = parameters[parameterName];
                        parameterValues[parameterName] = {
                            uniformName : name,
// TODO: account for parameter.type with semantic
                            func : defined(parameter.semantic) ? gltfSemanticUniforms[parameter.semantic](context.getUniformState()) : undefined
                        };
                    }
                }

                // Parameter overrides by the instance technique
// TODO: this overrides semantics?  What should the glTF spec say?
                var instanceParameters = instanceTechnique.values;
                var length = instanceParameters.length;
                for (var i = 0; i < length; ++i) {
                    var instanceParam = instanceParameters[i];
                    var parameterValue = parameterValues[instanceParam.parameter];
                    parameterValue.func = gltfUniformFunctions[parameters[instanceParam.parameter].type](instanceParam.value, model, context);
                }

                // Create uniform map
                var uniformMap = {};
                for (name in parameterValues) {
                    if (parameterValues.hasOwnProperty(name)) {
                        var pv = parameterValues[name];
                        uniformMap[pv.uniformName] = pv.func;
                    }
                }

                instanceTechnique.extra = defaultValue(instanceProgram.extra, {});
                instanceTechnique.extra.czmUniformMap = uniformMap;
            }
        }
    }

    function createCommand(model, node, context) {
        node.extra = defaultValue(node.extra, {});
        node.extra.czmMeshesCommands = {};

        var gltf = model.gltf;

        var attributes = gltf.attributes;
        var indices = gltf.indices;
        var meshes = gltf.meshes;

        var programs = gltf.programs;
        var techniques = gltf.techniques;
        var materials = gltf.materials;

        var name;
        for (name in meshes) {
            if (meshes.hasOwnProperty(name)) {
                var primitives = meshes[name].primitives;
                var length = primitives.length;
                var meshesCommands = new Array(length);

                for (var i = 0; i < length; ++i) {
                    var primitive = primitives[i];
                    var ix = indices[primitive.indices];
                    var instanceTechnique = materials[primitive.material].instanceTechnique;
                    var technique = techniques[instanceTechnique.technique];
                    var pass = technique.passes[technique.pass];
                    var instanceProgram = pass.instanceProgram;

                    var boundingSphere;
                    var positionAttribute = primitive.semantics.POSITION;
                    if (defined(positionAttribute)) {
                        var a = attributes[positionAttribute];
                        boundingSphere = BoundingSphere.fromCornerPoints(Cartesian3.fromArray(a.min), Cartesian3.fromArray(a.max));
                    }

                    var modelMatrix = new Matrix4(); // computed in update()
                    var primitiveType = PrimitiveType[primitive.primitive];
                    var vertexArray = primitive.extra.czmVertexArray;
                    var count = ix.count;
                    var offset = (ix.byteOffset / IndexDatatype[ix.type].sizeInBytes);  // glTF has offset in bytes.  Cesium has offsets in indices
                    var uniformMap = instanceTechnique.extra.czmUniformMap;
                    var rs = pass.states.extra.czmRenderState;

                    var command = new DrawCommand();
                    command.boundingVolume = boundingSphere;
                    command.modelMatrix = modelMatrix;
                    command.primitiveType = primitiveType;
                    command.vertexArray = vertexArray;
                    command.count = count;
                    command.offset = offset;
                    command.shaderProgram = programs[instanceProgram.program].extra.czmProgram;
                    command.uniformMap = uniformMap;
                    command.renderState = rs;

                    var pickCommand = new DrawCommand();
                    pickCommand.boundingVolume = boundingSphere;
                    pickCommand.modelMatrix = modelMatrix;
                    pickCommand.primitiveType = primitiveType;
                    pickCommand.vertexArray = vertexArray;
                    pickCommand.count = count;
                    pickCommand.offset = offset;
                    pickCommand.shaderProgram = programs[instanceProgram.program].extra.czmPickProgram;
// TODO: add czm_pickColor
                    pickCommand.uniformMap = uniformMap;
                    pickCommand.renderState = rs;

                    meshesCommands[i] = {
                        command : command,
                        pickCommand : pickCommand,
                        modelMatrix : modelMatrix
                    };
                }

                node.extra.czmMeshesCommands[name] = meshesCommands;
            }
        }
    }

    function createCommands(model, context) {
        var loadResources = model._loadResources;

// TODO: more fine-grained dependencies
        if (!loadResources.finishedPendingLoads() || !loadResources.finishedResourceCreation()) {
            return;
        }

        var gltf = model.gltf;
        var scenes = gltf.scenes;
        var nodes = gltf.nodes;

        var scene = scenes[gltf.scene];
        var sceneNodes = scene.nodes;
        var length = sceneNodes.length;

        for (var i = 0; i < length; ++i) {
            var node = nodes[sceneNodes[i]];
// TODO: handle camera and light nodes
            if (defined(node.meshes)) {
                createCommand(model, node, context);
            }
        }
    }

    function createResources(model, context) {
        createBuffers(model, context);      // using glTF bufferViews
        createPrograms(model, context);
        createTextures(model, context);

        createVertexArrays(model, context); // using glTF meshes
        createRenderStates(model, context); // using glTF materials/techniques/passes/states
        createUniformMaps(model, context);   // using glTF materials/techniques/passes/instanceProgram

        createCommands(model, context);     // using glTF scene
    }

    ///////////////////////////////////////////////////////////////////////////

    /**
     * @private
     */
    Model.prototype.update = function(context, frameState, commandList) {
        if (!this.show ||
            (frameState.mode !== SceneMode.SCENE3D)) {
// TODO: models in 2D and Columbus view
            return;
        }

        if ((this._state === ModelState.NEEDS_LOAD) && defined(this.gltf)) {
            this._state = ModelState.LOADING;
            this._loadResources = new LoadResources();
            parse(this);
        }

        if (this._state === ModelState.LOADING) {
            // Incrementally create WebGL resources as buffers/shaders/textures are downloaded
            createResources(this, context);

            var loadResources = this._loadResources;
            if (loadResources.finishedPendingLoads() && loadResources.finishedResourceCreation()) {
                this._state = ModelState.LOADED;
                this._loadResources = undefined;  // Clear CPU memory since WebGL resources were created.
            }
        }
    };

    /**
     * Returns true if this object was destroyed; otherwise, false.
     * <br /><br />
     * If this object was destroyed, it should not be used; calling any function other than
     * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
     *
     * @memberof Model
     *
     * @return {Boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
     *
     * @see Model#destroy
     */
    Model.prototype.isDestroyed = function() {
        return false;
    };

    function destroyExtra(property, resourceName) {
        for (var name in property) {
            if (property.hasOwnProperty(name)) {
                var extra = property[name].extra;
                if (defined(extra) && defined(extra[resourceName])) {
                    extra[resourceName] = extra[resourceName].destroy();
                }
            }
        }
    }

    /**
     * Destroys the WebGL resources held by this object.  Destroying an object allows for deterministic
     * release of WebGL resources, instead of relying on the garbage collector to destroy this object.
     * <br /><br />
     * Once an object is destroyed, it should not be used; calling any function other than
     * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
     * assign the return value (<code>undefined</code>) to the object as done in the example.
     *
     * @memberof Model
     *
     * @return {undefined}
     *
     * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
     *
     * @see Model#isDestroyed
     *
     * @example
     * model = model && model.destroy();
     */
    Model.prototype.destroy = function() {
        var gltf = this.gltf;
        destroyExtra(gltf.bufferViews, 'czmBuffer');
        destroyExtra(gltf.program, 'czmProgram');
        destroyExtra(gltf.program, 'czmPickProgram');
        destroyExtra(gltf.images, 'czmTexture');

        return destroyObject(this);
    };

    return Model;
});