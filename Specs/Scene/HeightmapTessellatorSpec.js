/*global defineSuite*/
defineSuite([
         'Core/HeightmapTessellator',
         'Core/Cartesian2',
         'Core/Cartesian3',
         'Core/Ellipsoid',
         'Core/Extent',
         'Core/Math',
         'Core/WebMercatorProjection'
     ], function(
         HeightmapTessellator,
         Cartesian2,
         Cartesian3,
         Ellipsoid,
         Extent,
         CesiumMath,
         WebMercatorProjection) {
    "use strict";
    /*global jasmine,describe,xdescribe,it,xit,expect,beforeEach,afterEach,beforeAll,afterAll,spyOn,runs,waits,waitsFor*/

    it('throws when heightmap is not provided', function() {
        expect(function() {
            HeightmapTessellator.computeVertices();
        }).toThrowDeveloperError();

        expect(function() {
            HeightmapTessellator.computeVertices({
                width : 2,
                height : 2,
                vertices : [],
                nativeExtent : {
                    west : 10.0,
                    south : 20.0,
                    east : 20.0,
                    north : 30.0
                },
                skirtHeight : 10.0
            });
        }).toThrowDeveloperError();
    });

    it('throws when width or height is not provided', function() {
        expect(function() {
            HeightmapTessellator.computeVertices({
                heightmap : [1.0, 2.0, 3.0, 4.0],
                height : 2,
                vertices : [],
                nativeExtent : {
                    west : 10.0,
                    south : 20.0,
                    east : 20.0,
                    north : 30.0
                },
                skirtHeight : 10.0
            });
        }).toThrowDeveloperError();

        expect(function() {
            HeightmapTessellator.computeVertices({
                heightmap : [1.0, 2.0, 3.0, 4.0],
                width : 2,
                vertices : [],
                nativeExtent : {
                    west : 10.0,
                    south : 20.0,
                    east : 20.0,
                    north : 30.0
                },
                skirtHeight : 10.0
            });
        }).toThrowDeveloperError();
    });

    it('throws when vertices is not provided', function() {
        expect(function() {
            HeightmapTessellator.computeVertices({
                heightmap : [1.0, 2.0, 3.0, 4.0],
                width : 2,
                height : 2,
                nativeExtent : {
                    west : 10.0,
                    south : 20.0,
                    east : 20.0,
                    north : 30.0
                },
                skirtHeight : 10.0
            });
        }).toThrowDeveloperError();
    });

    it('throws when nativeExtent is not provided', function() {
        expect(function() {
            HeightmapTessellator.computeVertices({
                heightmap : [1.0, 2.0, 3.0, 4.0],
                width : 2,
                height : 2,
                vertices : [],
                skirtHeight : 10.0
            });
        }).toThrowDeveloperError();
    });

    it('throws when skirtHeight is not provided', function() {
        expect(function() {
            HeightmapTessellator.computeVertices({
                heightmap : [1.0, 2.0, 3.0, 4.0],
                width : 2,
                height : 2,
                vertices : [],
                nativeExtent : {
                    west : 10.0,
                    south : 20.0,
                    east : 20.0,
                    north : 30.0
                }
            });
        }).toThrowDeveloperError();
    });

    it('creates mesh without skirt', function() {
        var width = 3;
        var height = 3;
        var vertices = new Float32Array(width * height * 6);
        var description = {
            vertices : vertices,
            heightmap : [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
            width : width,
            height : height,
            skirtHeight : 0.0,
            nativeExtent : {
                west : 10.0,
                south : 30.0,
                east : 20.0,
                north : 40.0
            },
            extent : new Extent(
                CesiumMath.toRadians(10.0),
                CesiumMath.toRadians(30.0),
                CesiumMath.toRadians(20.0),
                CesiumMath.toRadians(40.0))
        };
        HeightmapTessellator.computeVertices(description);

        var ellipsoid = Ellipsoid.WGS84;
        var nativeExtent = description.nativeExtent;

        for (var j = 0; j < height; ++j) {
            var latitude = CesiumMath.lerp(nativeExtent.north, nativeExtent.south, j / (height - 1));
            latitude = CesiumMath.toRadians(latitude);
            for (var i = 0; i < width; ++i) {
                var longitude = CesiumMath.lerp(nativeExtent.west, nativeExtent.east, i / (width - 1));
                longitude = CesiumMath.toRadians(longitude);

                var heightSample = description.heightmap[j * width + i];

                var expectedVertexPosition = ellipsoid.cartographicToCartesian({
                    longitude : longitude,
                    latitude : latitude,
                    height : heightSample
                });

                var index = (j * width + i) * 6;
                var vertexPosition = new Cartesian3(vertices[index], vertices[index + 1], vertices[index + 2]);

                expect(vertexPosition).toEqualEpsilon(expectedVertexPosition, 1.0);
                expect(vertices[index + 3]).toEqual(heightSample);
                expect(vertices[index + 4]).toEqualEpsilon(i / (width - 1), CesiumMath.EPSILON7);
                expect(vertices[index + 5]).toEqualEpsilon(1.0 - j / (height - 1), CesiumMath.EPSILON7);
            }
        }
    });

    it('creates mesh with skirt', function() {
        var width = 3;
        var height = 3;
        var vertices = new Float32Array((width + 2) * (height + 2) * 6);
        var description = {
            vertices : vertices,
            heightmap : [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
            width : width,
            height : height,
            skirtHeight : 10.0,
            nativeExtent : {
                west : 10.0,
                east : 20.0,
                south : 30.0,
                north : 40.0
            }
        };
        HeightmapTessellator.computeVertices(description);

        var ellipsoid = Ellipsoid.WGS84;
        var nativeExtent = description.nativeExtent;

        for (var j = -1; j <= height; ++j) {
            var realJ = CesiumMath.clamp(j, 0, height - 1);
            var latitude = CesiumMath.lerp(nativeExtent.north, nativeExtent.south, realJ / (height - 1));
            latitude = CesiumMath.toRadians(latitude);
            for (var i = -1; i <= width; ++i) {
                var realI = CesiumMath.clamp(i, 0, width - 1);
                var longitude = CesiumMath.lerp(nativeExtent.west, nativeExtent.east, realI / (width - 1));
                longitude = CesiumMath.toRadians(longitude);

                var heightSample = description.heightmap[realJ * width + realI];

                if (realI !== i || realJ !== j) {
                    heightSample -= description.skirtHeight;
                }

                var expectedVertexPosition = ellipsoid.cartographicToCartesian({
                    longitude : longitude,
                    latitude : latitude,
                    height : heightSample
                });

                var index = ((j + 1) * (width + 2) + i + 1) * 6;
                var vertexPosition = new Cartesian3(vertices[index], vertices[index + 1], vertices[index + 2]);

                expect(vertexPosition).toEqualEpsilon(expectedVertexPosition, 1.0);
                expect(vertices[index + 3]).toEqual(heightSample);
                expect(vertices[index + 4]).toEqualEpsilon(realI / (width - 1), CesiumMath.EPSILON7);
                expect(vertices[index + 5]).toEqualEpsilon(1.0 - realJ / (height - 1), CesiumMath.EPSILON7);
            }
        }
    });

    it('tessellates web mercator heightmaps', function() {
        var width = 3;
        var height = 3;
        var vertices = new Float32Array(width * height * 6);
        var description = {
            vertices : vertices,
            heightmap : [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
            width : width,
            height : height,
            skirtHeight : 0.0,
            nativeExtent : {
                west : 1000000.0,
                east : 2000000.0,
                south : 3000000.0,
                north : 4000000.0
            },
            isGeographic : false
        };
        HeightmapTessellator.computeVertices(description);

        var ellipsoid = Ellipsoid.WGS84;
        var projection = new WebMercatorProjection(ellipsoid);
        var nativeExtent = description.nativeExtent;

        var geographicSouthwest = projection.unproject(new Cartesian2(nativeExtent.west, nativeExtent.south));
        var geographicNortheast = projection.unproject(new Cartesian2(nativeExtent.east, nativeExtent.north));

        for (var j = 0; j < height; ++j) {
            var y = CesiumMath.lerp(nativeExtent.north, nativeExtent.south, j / (height - 1));
            for (var i = 0; i < width; ++i) {
                var x = CesiumMath.lerp(nativeExtent.west, nativeExtent.east, i / (width - 1));

                var latLon = projection.unproject(new Cartesian2(x, y));
                var longitude = latLon.longitude;
                var latitude = latLon.latitude;

                var heightSample = description.heightmap[j * width + i];

                var expectedVertexPosition = ellipsoid.cartographicToCartesian({
                    longitude : longitude,
                    latitude : latitude,
                    height : heightSample
                });

                var index = (j * width + i) * 6;
                var vertexPosition = new Cartesian3(vertices[index], vertices[index + 1], vertices[index + 2]);

                var expectedU = (longitude - geographicSouthwest.longitude) / (geographicNortheast.longitude - geographicSouthwest.longitude);
                var expectedV = (latitude - geographicSouthwest.latitude) / (geographicNortheast.latitude - geographicSouthwest.latitude);

                expect(vertexPosition).toEqualEpsilon(expectedVertexPosition, 1.0);
                expect(vertices[index + 3]).toEqual(heightSample);
                expect(vertices[index + 4]).toEqualEpsilon(expectedU, CesiumMath.EPSILON7);
                expect(vertices[index + 5]).toEqualEpsilon(expectedV, CesiumMath.EPSILON7);
            }
        }
    });

    it('supports multi-element little endian heights', function() {
        var width = 3;
        var height = 3;
        var vertices = new Float32Array(width * height * 6);
        var description = {
            vertices : vertices,
            heightmap : [1.0, 2.0, 100.0,
                         3.0, 4.0, 100.0,
                         5.0, 6.0, 100.0,
                         7.0, 8.0, 100.0,
                         9.0, 10.0, 100.0,
                         11.0, 12.0, 100.0,
                         13.0, 14.0, 100.0,
                         15.0, 16.0, 100.0,
                         17.0, 18.0, 100.0],
            width : width,
            height : height,
            skirtHeight : 0.0,
            nativeExtent : {
                west : 10.0,
                south : 30.0,
                east : 20.0,
                north : 40.0
            },
            extent : new Extent(
                CesiumMath.toRadians(10.0),
                CesiumMath.toRadians(30.0),
                CesiumMath.toRadians(20.0),
                CesiumMath.toRadians(40.0)),
            structure : {
                stride : 3,
                elementsPerHeight : 2,
                elementMultiplier : 10
            }
        };
        HeightmapTessellator.computeVertices(description);

        var ellipsoid = Ellipsoid.WGS84;
        var nativeExtent = description.nativeExtent;

        for (var j = 0; j < height; ++j) {
            var latitude = CesiumMath.lerp(nativeExtent.north, nativeExtent.south, j / (height - 1));
            latitude = CesiumMath.toRadians(latitude);
            for (var i = 0; i < width; ++i) {
                var longitude = CesiumMath.lerp(nativeExtent.west, nativeExtent.east, i / (width - 1));
                longitude = CesiumMath.toRadians(longitude);

                var heightSampleIndex = (j * width + i) * description.structure.stride;
                var heightSample = description.heightmap[heightSampleIndex] + description.heightmap[heightSampleIndex + 1] * 10.0;

                var expectedVertexPosition = ellipsoid.cartographicToCartesian({
                    longitude : longitude,
                    latitude : latitude,
                    height : heightSample
                });

                var index = (j * width + i) * 6;
                var vertexPosition = new Cartesian3(vertices[index], vertices[index + 1], vertices[index + 2]);

                expect(vertexPosition).toEqualEpsilon(expectedVertexPosition, 1.0);
                expect(vertices[index + 3]).toEqual(heightSample);
                expect(vertices[index + 4]).toEqualEpsilon(i / (width - 1), CesiumMath.EPSILON7);
                expect(vertices[index + 5]).toEqualEpsilon(1.0 - j / (height - 1), CesiumMath.EPSILON7);
            }
        }
    });

    it('supports multi-element big endian heights', function() {
        var width = 3;
        var height = 3;
        var vertices = new Float32Array(width * height * 6);
        var description = {
            vertices : vertices,
            heightmap : [1.0, 2.0, 100.0,
                         3.0, 4.0, 100.0,
                         5.0, 6.0, 100.0,
                         7.0, 8.0, 100.0,
                         9.0, 10.0, 100.0,
                         11.0, 12.0, 100.0,
                         13.0, 14.0, 100.0,
                         15.0, 16.0, 100.0,
                         17.0, 18.0, 100.0],
            width : width,
            height : height,
            skirtHeight : 0.0,
            nativeExtent : {
                west : 10.0,
                south : 30.0,
                east : 20.0,
                north : 40.0
            },
            extent : new Extent(
                CesiumMath.toRadians(10.0),
                CesiumMath.toRadians(30.0),
                CesiumMath.toRadians(20.0),
                CesiumMath.toRadians(40.0)),
            structure : {
                stride : 3,
                elementsPerHeight : 2,
                elementMultiplier : 10,
                isBigEndian : true
            }
        };
        HeightmapTessellator.computeVertices(description);

        var ellipsoid = Ellipsoid.WGS84;
        var nativeExtent = description.nativeExtent;

        for (var j = 0; j < height; ++j) {
            var latitude = CesiumMath.lerp(nativeExtent.north, nativeExtent.south, j / (height - 1));
            latitude = CesiumMath.toRadians(latitude);
            for (var i = 0; i < width; ++i) {
                var longitude = CesiumMath.lerp(nativeExtent.west, nativeExtent.east, i / (width - 1));
                longitude = CesiumMath.toRadians(longitude);

                var heightSampleIndex = (j * width + i) * description.structure.stride;
                var heightSample = description.heightmap[heightSampleIndex] * 10.0 + description.heightmap[heightSampleIndex + 1];

                var expectedVertexPosition = ellipsoid.cartographicToCartesian({
                    longitude : longitude,
                    latitude : latitude,
                    height : heightSample
                });

                var index = (j * width + i) * 6;
                var vertexPosition = new Cartesian3(vertices[index], vertices[index + 1], vertices[index + 2]);

                expect(vertexPosition).toEqualEpsilon(expectedVertexPosition, 1.0);
                expect(vertices[index + 3]).toEqual(heightSample);
                expect(vertices[index + 4]).toEqualEpsilon(i / (width - 1), CesiumMath.EPSILON7);
                expect(vertices[index + 5]).toEqualEpsilon(1.0 - j / (height - 1), CesiumMath.EPSILON7);
            }
        }
    });
});
