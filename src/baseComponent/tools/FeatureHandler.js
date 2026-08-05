import { getLocationType } from "./Common.ts";

var jsonFormat = new ol.format.GeoJSON(); //geojson格式转换
var wktFormat = new ol.format.WKT(); //wkt格式转换
var jstsParser = new jsts.io.OL3Parser();
var styleCache = {}; //聚合显示getFeature
var routeColorIndex = 0;
var routeColor = [
    {
        lineColor: '#00ca76',
    },
    {
        lineColor: '#ffaa00',
    },
    {
        lineColor: '#4479d4',
    },
    {
        lineColor: '#009b95',
    },
    {
        lineColor: '#db0058',
    },
];
/**
 * 设置要素类型
 * @params feature 要素
 * @returns feature 返回处理后的要素
 *
 */

function setFeatureType(feature) {
    if (!feature.getId()) {
        return null;
    }
    let featureType = feature.getId().split('.')[0].toString();
    feature.setProperties({ type: featureType });
    return feature;
}

/**
 * 获取一个点对象
 * @params lng 经度
 * @params lat 纬度
 * @returns point 返回点空间对象
 *
 */
function getPoint(lng, lat) {
    let point;
    if (_transformCoord == 1) {
        point = new ol.geom.Point([lng, lat]).transform('EPSG:4326', MAPCONFIG.projection.getCode());
    } else {
        point = new ol.geom.Point([lng, lat]);
    }
    return point;
}

/**
 * 获取一个面对象
 * @params geometryAr 经度
 * @returns polygon 返回面空间对象
 *
 */
let getPolygon = function (geometryAr) {
    let polygon;
    if (_transformCoord == 1) {
        polygon = new ol.geom.Polygon([geometryAr]).transform('EPSG:4326', MAPCONFIG.projection.getCode());
    } else {
        polygon = new ol.geom.Polygon([geometryAr]);
    }
    return polygon;
};

/**
 * 获取一个圆
 * @params lng 经度
 * @params lng 纬度
 * @params radius 半径
 * @returns polygon 返回面空间对象
 *
 */
function getCircle(lng, lat, radius) {
    var lonlat = lonlat2mercator(lng, lat);
    //	let circle = new ol.geom.Circle([lonlat.x,lonlat.y],radius);
    var circle = new ol.geom.Circle([lonlat.x, lonlat.y], radius * 1.2);
    return circle;
}

/**
 * 经纬度转为莫卡托坐标
 * @params obj 要素对象信息
 * @returns mercator 返回空间对象
 *
 */
function formFeature(obj) {
    let feature = new ol.Feature({
        geometry: obj.geom,
        type: obj.type,
    });
    if (obj.attributs != null) {
        obj.attributs.type = obj.type;
        feature.setProperties(obj.attributs);
        feature.setGeometry(obj.geom);
    }
    feature.setStyle(obj.style);
    feature.setId(obj.id);
    return feature;
}

/**
 * 图层查询中文字符串转换
 * @param   radius   半径
 * @param   location 坐标
 * @returns result   转换结果
 *
 */
function getPointInCircle(location, radius) {
    let r = radius * (Math.random() + 5) * 0.1;
    let theta = Math.floor(Math.random() * 360);
    let x = r * Math.sin(theta);
    let y = r * Math.cos(theta);
    let point = new ol.geom.Point([Number(location[0] + x), Number(location[1] + y)]);
    return point;
}

/**
 * 根据空间对象缓冲分析
 * @params geom       中心点
 * @params radius     缓冲半径
 * @returns bufferWkt 字符串
 *
 */
function bufferResult(geom, radius) {
    let baseGeom = jstsParser.read(geom);
    let bufferWkt = wktFormat.writeGeometry(jstsParser.write(baseGeom.buffer(radius)));
    return bufferWkt;
}

/**
 * 合并空间对象
 * @params geometrys  集合对象集合
 * @returns bufferWkt 字符串
 *
 */
function unionGeom(geometrys) {
    let result;
    let baseGeom = jstsParser.read(geometrys[0]);
    for (let i = 1; i < geometrys.length; i++) {
        let geoItem = jstsParser.read(geometrys[i]);
        baseGeom = baseGeom.union(geoItem);
    }
    if (baseGeom) {
        result = wktFormat.writeGeometry(jstsParser.write(baseGeom));
    }
    return result;
}

/**
 * 经纬度转为莫卡托坐标
 * @params lng 经度
 * @params lat 纬度
 * @returns mercator 返回空间对象
 *
 */
function lonlat2mercator(lng, lat) {
    lng = parseFloat(lng);
    lat = parseFloat(lat);
    let mercator = {
        x: 0,
        y: 0,
    };
    let x = (lng * 20037508.34) / 180;
    let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
    y = (y * 20037508.34) / 180;
    mercator.x = x;
    mercator.y = y;
    return mercator;
}

/**
 * 莫卡托坐标转为经纬度
 * @params lng 经度
 * @params lat 纬度
 * @returns lonlat 返回经纬度对象
 *
 */
function mercator2lonlat(lng, lat) {
    lng = parseFloat(lng);
    lat = parseFloat(lat);
    let lonlat = {
        x: 0,
        y: 0,
    };
    let x = (lng / 20037508.34) * 180;
    let y = (lat / 20037508.34) * 180;
    y = (180 / Math.PI) * (2 * Math.atan(Math.exp((y * Math.PI) / 180)) - Math.PI / 2);
    lonlat.x = x;
    lonlat.y = y;
    return lonlat;
}

/**
 * 生成三圈范围
 * @params mode    模块
 * @params feature 警情要素
 *
 */
function getTreeCircle(mode, alarm) {
    mode.vectorLayer.getSource().clear(); //清空之前的内容。
    let features = [];
    let coord = wktFormat.readGeometry(alarm.LOCATION).getCoordinates();
    MAPCONFIG.alarm = { x: coord[0], y: coord[1], radius: 5000, attritutes: alarm };
    //灾害圈1
    let alarmCircleFeature1 = new ol.Feature({
        geometry: getCircle(coord[0], coord[1], mode.threeCircle[0]),
        type: 'alarmCircle',
    });
    alarmCircleFeature1.setStyle(getStyle('circle'), '');
    //灾害圈2
    let alarmCircleFeature2 = new ol.Feature({
        geometry: getCircle(coord[0], coord[1], mode.threeCircle[1]),
        type: 'alarmCircle',
        labelPoint: getPoint(coord[0], coord[1]),
        name: '3000m',
    });
    alarmCircleFeature2.setStyle(getStyle('yellowCircle'), mode.threeCircle[1] + 'm');
    //灾害圈3
    let alarmCircleFeature3 = new ol.Feature({
        geometry: getCircle(coord[0], coord[1], mode.threeCircle[2]),
        type: 'alarmCircle',
    });
    alarmCircleFeature3.setStyle(getStyle('greenCircle'), '');
    let alarmPoint = getPoint(coord[0], coord[1]);
    //灾害点
    let alarmPointFeature = new ol.Feature({
        geometry: alarmPoint,
        type: 'alarm',
    });
    alarmCircleFeature1.setId('alarmCircle');
    alarmCircleFeature2.setId('alarmCircle2');
    alarmCircleFeature3.setId('alarmCircle3');
    alarmPointFeature.setId('alarm');
    alarmPointFeature.setProperties(alarm);
    alarmPointFeature.setStyle(getStyle('alarm'));
    features = [alarmPointFeature, alarmCircleFeature1, alarmCircleFeature2, alarmCircleFeature3];
    //	mode.vectorLayer.getSource().addFeatures(features);
    zoomToFeature(mode, features[3]); //缩放到指定要素
    return features;
}

/**
 * 获取要素样式
 * @params type 类型
 *
 */
function getStyle(type, name, geom) {
    var style;
    switch (type) {
        case 'custom':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 30],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/' + name,
                        imgSize: [36, 36],
                    }),
                });
            }
            break;
        case 'kld':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 10],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/kld/OM_' + name + '01.png',
                        imgSize: [16, 16],
                    }),
                });
            }
            break;
        case 'circle':
            {
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 0, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 0, 0,0.6)',
                        width: 2,
                    }),
                    image: new ol.style.Circle({
                        radius: 7,
                        fill: new ol.style.Fill({
                            color: '#ffcc33',
                        }),
                    }),
                });
            }
            break;
        case 'yellowCircle':
            {
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: 'rgba(255,255, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 255, 0,0.6)',
                        width: 2,
                    }),
                    image: new ol.style.Circle({
                        radius: 7,
                        fill: new ol.style.Fill({
                            color: '#ffcc33',
                        }),
                    }),
                });
            }
            break;
        case 'greenCircle':
            {
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: 'rgba(0,255, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(0, 255, 0,0.6)',
                        width: 2,
                    }),
                    image: new ol.style.Circle({
                        radius: 7,
                        fill: new ol.style.Fill({
                            color: '#ffcc33',
                        }),
                    }),
                });
            }
            break;
        case 'alarm':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 30],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/重大警情.png',
                        imgSize: [36, 36],
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 0, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 0, 0,0.6)',
                        width: 2,
                    }),
                });
            }
            break;
        case 'mobile':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 30],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/mobile.png',
                        imgSize: [36, 36],
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 0, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 0, 0,0.6)',
                        width: 2,
                    }),
                });
            }
            break;
        case 'fireLocation':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 30],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/fireLocation.png',
                        imgSize: [36, 36],
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 0, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 0, 0,0.6)',
                        width: 2,
                    }),
                });
            }
            break;

        // 手机定位：SJDW
        // 手工标注：SGBZ
        // 案发地址标注：AFDZDW
        // 三字段定位：SZDDW
        case 'SJDW':
        case 'SGBZ':
        case 'AFDZDW':
        case 'SZDDW':
        case 'phonealarm':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 30],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/来电.png',
                        imgSize: [54, 54],
                        scale: 0.5,
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 0, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 0, 0,0.6)',
                        width: 2,
                    }),
                });
            }
            break;
        case 'WZBJDW': //微站报警定位报警
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 30],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/app.png',
                        imgSize: [54, 54],
                        scale: 0.5,
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 0, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 0, 0,0.6)',
                        width: 2,
                    }),
                });
            }
            break;
        case 'ECDW': //二次定位：ECDW 到达现场回传的定位，最精确
        case 'HLWBJDW': //互联网报警定位
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 30],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/sms.png',
                        imgSize: [54, 54],
                        scale: 0.5,
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 0, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 0, 0,0.6)',
                        width: 2,
                    }),
                });
            }
            break;
        case 'WXBJDW': //微信报警定位
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 30],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/wechat.png',
                        imgSize: [54, 54],
                        scale: 0.5,
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 0, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 0, 0,0.6)',
                        width: 2,
                    }),
                });
            }
            break;
        case 'basefire':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 15],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/即时警情.png',
                        imgSize: [36, 36],
                    }),
                });
            }
            break;
        case 'disaster':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 32],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/重大警情.png',
                        //           size:[32,32]
                        imgSize: [36, 36],
                    }),
                });
            }
            break;
        case 'dutycar':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 24],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/车辆.png',
                        //           size:[32,32]
                        imgSize: [32, 32],
                    }),
                });
            }
            break;
        case 'commongroup':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 24],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/通用组.png',
                        //           size:[32,32]
                        imgSize: [40, 40],
                    }),
                });
            }
            break;
        case 'firegroup':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 24],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/消防组.png',
                        //           size:[32,32]
                        imgSize: [32, 32],
                    }),
                });
            }
            break;
        case 'dutygroup':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 24],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/执勤组.png',
                        //           size:[32,32]
                        imgSize: [32, 32],
                    }),
                });
            }
            break;
        case 'command':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 24],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/指挥部.png',
                        imgSize: [32, 32],
                    }),
                });
            }
            break;
        case 'start':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.45, 24],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/start_point1.png',
                        imgSize: [40, 51],
                    }),
                    text: new ol.style.Text({
                        text: name,
                        offsetY: -25,
                        font: 'bold 13px sans-serif',
                        backgroundFill: new ol.style.Fill({
                            color: '#1212de',
                        }),
                        backgroundStroke: new ol.style.Stroke({
                            color: '#ffffff',
                            width: 1,
                        }),
                        fill: new ol.style.Fill({
                            color: '#fff',
                            stroke: new ol.style.Stroke({
                                color: '#fff',
                                width: 5,
                            }),
                        }),
                    }),
                    zIndex: 10001,
                });
            }
            break;
        case 'end':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.45, 24],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/end_point1.png',
                        imgSize: [40, 51],
                    }),
                    zIndex: 10001,
                });
            }
            break;

        case 'sp':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 32],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/涉会场所.png',
                        //           size:[32,32]
                        imgSize: [48, 48],
                    }),
                    text: new ol.style.Text({
                        text: ' ' + name + ' ',
                        offsetY: -20,
                        offsetX: 20,
                        font: 'bold 14px MicrosoftYaHei',
                        backgroundFill: new ol.style.Fill({
                            color: '#920783',
                            stroke: new ol.style.Stroke({
                                color: '#920783',
                                width: 1,
                            }),
                        }),
                        fill: new ol.style.Fill({
                            color: '#fff',
                            stroke: new ol.style.Stroke({
                                color: '#fff',
                                width: 5,
                            }),
                        }),
                    }),
                });
            }
            break;
        case 'buffer':
            {
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 255, 0, 0.4)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 255, 0,1)',
                        width: 2,
                    }),
                    image: new ol.style.Circle({
                        radius: 5,
                        fill: new ol.style.Fill({
                            color: '#ffcc33',
                        }),
                    }),
                });
            }
            break;
        case 'track-arrive':
            {
                name = name ? name : '测试';
                style = function (feature, resolution) {
                    var direction = feature.get('direction') ? feature.get('direction') : 90;
                    var src = feature.get('color') ? 'track-normal.png' : 'track-disable.png';
                    var functionStyle = new ol.style.Style({
                        image: new ol.style.Icon({
                            opacity: 1,
                            // src: ctxContent + '/css/images/'+feature.get("status")?'track-normal.png':'track-disable.png',
                            //           size:[32,32],
                            src: ctxContent + '/css/images/' + src,
                            scale: getImgFactor(),
                            imgSize: [64, 64],
                        }),
                        text: new ol.style.Text({
                            text: ' ' + name + ' ',
                            offsetY: -25,
                            font: 'bold 13px sans-serif',
                            backgroundFill: new ol.style.Fill({
                                color: '#059c7e',
                            }),
                            backgroundStroke: new ol.style.Stroke({
                                color: '#ffffff',
                                width: 1,
                            }),
                            fill: new ol.style.Fill({
                                color: '#fff',
                                stroke: new ol.style.Stroke({
                                    color: '#fff',
                                    width: 5,
                                }),
                            }),
                        }),
                        fill: new ol.style.Fill({
                            color: 'rgba(255, 0, 0, 0.1)',
                        }),
                        stroke: new ol.style.Stroke({
                            color: 'rgba(255, 0, 0,0.6)',
                            width: 2,
                        }),
                    });
                    if (direction) {
                        functionStyle.getImage().setRotation(Number(direction));
                    }
                    return functionStyle;
                };
            }
            break;
        case 'track':
            {
                name = name ? name : '测试';
                style = function (feature, resolution) {
                    var direction = feature.get('direction') ? feature.get('direction') : 90;
                    var src = feature.get('color') ? 'track-normal.png' : 'track-disable.png';
                    var functionStyle = new ol.style.Style({
                        image: new ol.style.Icon({
                            opacity: 1,
                            // src: ctxContent + '/css/images/'+feature.get("status")?'track-normal.png':'track-disable.png',
                            src: ctxContent + '/css/images/' + src,
                            scale: getImgFactor(),
                            imgSize: [64, 64],
                        }),
                        text: new ol.style.Text({
                            text: ' ' + name + ' ',
                            offsetY: -20,
                            font: 'bold 13px sans-serif',
                            backgroundFill: new ol.style.Fill({
                                color: '#1212de',
                            }),
                            backgroundStroke: new ol.style.Stroke({
                                color: '#ffffff',
                                width: 1,
                            }),
                            fill: new ol.style.Fill({
                                color: '#fff',
                                stroke: new ol.style.Stroke({
                                    color: '#fff',
                                    width: 5,
                                }),
                            }),
                        }),
                        fill: new ol.style.Fill({
                            color: 'rgba(255, 0, 0, 0.1)',
                        }),
                        stroke: new ol.style.Stroke({
                            color: 'rgba(255, 0, 0,0.6)',
                            width: 2,
                        }),
                    });
                    if (direction) {
                        functionStyle.getImage().setRotation(Number(direction));
                    }
                    return functionStyle;
                };
            }
            break;
        case 'track-withouttext':
            {
                style = function (feature, resolution) {
                    var direction = feature.get('direction') ? feature.get('direction') : 90;
                    var src = feature.get('color') ? 'track-normal.png' : 'track-disable.png';
                    var functionStyle = new ol.style.Style({
                        image: new ol.style.Icon({
                            opacity: 1,
                            // src: ctxContent + '/css/images/'+feature.get("status")?'track-normal.png':'track-disable.png',
                            src: ctxContent + '/css/images/' + src,
                            scale: getImgFactor(),
                            imgSize: [64, 64],
                        }),
                        fill: new ol.style.Fill({
                            color: 'rgba(255, 0, 0, 0.1)',
                        }),
                        stroke: new ol.style.Stroke({
                            color: 'rgba(255, 0, 0,0.6)',
                            width: 2,
                        }),
                    });
                    if (direction) {
                        functionStyle.getImage().setRotation(Number(direction));
                    }
                    return functionStyle;
                };
            }
            break;
        case 'trackRoute':
            {
                name = name ? name : '测试11';
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: '#0080ff',
                    }),
                    stroke: new ol.style.Stroke({
                        color: '#0080ff',
                        width: 6,
                    }),
                    text: new ol.style.Text({
                        text: ' ' + name + ' ',
                        offsetY: -25,
                        font: 'bold 14px sans-serif',
                        backgroundFill: new ol.style.Fill({
                            color: '#004667',
                            stroke: new ol.style.Stroke({
                                color: '#004667',
                                width: 1,
                            }),
                        }),
                        fill: new ol.style.Fill({
                            color: '#fff',
                            stroke: new ol.style.Stroke({
                                color: '#fff',
                                width: 5,
                            }),
                        }),
                    }),
                });
            }
            break;
        case 'baseRoute':
            {
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: '#0080ff',
                    }),
                    stroke: new ol.style.Stroke({
                        color: '#0080ff',
                        width: 6,
                    }),
                });
            }
            break;
        case 'light':
            {
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: '#ff0000',
                    }),
                    stroke: new ol.style.Stroke({
                        color: '#ff0000',
                        width: 5,
                    }),
                });
            }
            break;
        case 'hightLight':
            {
                let textStyle = '';
                if (name) {
                    textStyle = new ol.style.Text({
                        text: ' ' + name + ' ',
                        offsetY: -20,
                        offsetX: 20,
                        font: 'bold 16px MicrosoftYaHei',
                        // backgroundFill:new ol.style.Fill({
                        //     color : '#fff',
                        //     stroke : new ol.style.Stroke({
                        //         color : '#fff',
                        //         width : 1
                        //     })
                        // }),
                        fill: new ol.style.Fill({
                            color: '#0080C0',
                            stroke: new ol.style.Stroke({
                                color: '#0080C0',
                                width: 5,
                            }),
                        }),
                    });
                }
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: 'rgba(255,0,0,0.15)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255,0,0,.4)',
                        width: 5,
                    }),
                });
                style.setText(textStyle);
            }
            break;
        case 'hightLightArea':
            {
                let textStyle = '';
                if (name) {
                    textStyle = new ol.style.Text({
                        text: ' ' + name + ' ',
                        offsetY: -20,
                        offsetX: 20,
                        font: 'bold 28px MicrosoftYaHei',
                        overflow: true,
                        // backgroundFill:new ol.style.Fill({
                        //     color : '#fff',
                        //     stroke : new ol.style.Stroke({
                        //         color : '#fff',
                        //         width : 1
                        //     })
                        // }),
                        fill: new ol.style.Fill({
                            color: '#800040',
                            stroke: new ol.style.Stroke({
                                color: '#ffffff',
                                width: 8,
                            }),
                        }),
                        stroke: new ol.style.Stroke({
                            color: '#ffffff',
                            width: 5,
                        }),
                        // backgroundFill:new ol.style.Fill({
                        //     color:'#9722B4'
                        // })
                    });
                }
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: 'rgba(11,189,57,0.15)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(11,189,57,1)',
                        width: 5,
                    }),
                });
                style.setText(textStyle);
            }
            break;
        case 'hightLightorg':
            {
                let textStyle = '';
                if (name) {
                    textStyle = new ol.style.Text({
                        text: ' ' + name + ' ',
                        offsetY: -20,
                        offsetX: 20,
                        font: 'bold 22px MicrosoftYaHei',
                        // backgroundFill:new ol.style.Fill({
                        //     color : '#fff',
                        //     stroke : new ol.style.Stroke({
                        //         color : '#fff',
                        //         width : 1
                        //     })
                        // }),
                        fill: new ol.style.Fill({
                            color: '#800040',
                            stroke: new ol.style.Stroke({
                                color: '#0080C0',
                                width: 5,
                            }),
                        }),
                        stroke: new ol.style.Stroke({
                            color: '#ffffff',
                            width: 3,
                        }),
                    });
                }
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: 'rgba(11,189,57,0.20)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(11,189,57,1)',
                        width: 5,
                    }),
                });
                style.setText(textStyle);
            }
            break;
        case 'fireCluster':
            {
                var size = name.get('features').length;
                if (size == 1) {
                    // var key=name.get('features')[0].getProperties()["ZDZQID"];
                    var status = name.get('features')[0].getProperties()['zqzt'];
                    var type = name.get('features')[0].getProperties()['zhsglxdmYj'];
                    var alarmType = '';
                    switch (type) {
                        case '10000':
                            {
                                alarmType = '火灾扑救';
                            }
                            break;
                        case '20000':
                            {
                                alarmType = '抢险救援';
                            }
                            break;
                        case '30000':
                            {
                                alarmType = '反恐排爆';
                            }
                            break;
                        case '40000':
                            {
                                alarmType = '公务执勤';
                            }
                            break;
                        case '50000':
                            {
                                alarmType = '社会救助';
                            }
                            break;
                        case '60000':
                            {
                                alarmType = '其他救援';
                            }
                            break;
                        case '70000':
                            {
                                alarmType = '演练测试';
                            }
                            break;
                    }

                    style = new ol.style.Style({
                        image: new ol.style.Icon({
                            anchor: [0.5, 24],
                            anchorXUnits: 'fraction',
                            anchorYUnits: 'pixels',
                            opacity: 1,
                            scale: 1,
                            src:
                                ctxContent +
                                '/css/images/alarm/' +
                                alarmType +
                                (status == 12 ? '-已结案' : '-未结案') +
                                '.png',
                            imgSize: [32, 32],
                        }),
                    });
                    // if(key){
                    //     style=new ol.style.Style({
                    //         image: new ol.style.Icon(
                    //             ({
                    //                 anchor: [0.5, 16],
                    //                 anchorXUnits: 'fraction',
                    //                 anchorYUnits: 'pixels',
                    //                 opacity: 1,
                    //                 src:  ctxContent+'/css/images/重大警情'+(status==12?"-灰":"")+'.png',
                    //                 imgSize: [36,36]
                    //             }))
                    //     });
                    // }
                    // else{
                    //     style=new ol.style.Style(
                    //         {
                    //             image : new ol.style.Icon(
                    //                 {
                    //                     anchor: [0.5, 12],
                    //                     anchorXUnits: 'fraction',
                    //                     anchorYUnits: 'pixels',
                    //                     opacity: 1,
                    //                     src:  ctxContent+'/css/images/即时警情'+(status==12?"-灰":"")+'.png',
                    //                     imgSize: [36,36]
                    //                 })
                    //         });
                    // }
                } else {
                    var style = styleCache[size];
                    if (!style) {
                        let img = '';
                        let p, p1, p2, p3;
                        if (size >= 1000) {
                            img = ctxContent + '/css/images/m4.png';
                            p = 90;
                            p1 = 89;
                            p2 = 45;
                            p3 = 48;
                        } else if (size >= 100 && size < 1000) {
                            img = ctxContent + '/css/images/m3.png';
                            p = 78;
                            p1 = 77;
                            p2 = 39;
                            p3 = 41;
                        } else if (size >= 50 && size < 100) {
                            img = ctxContent + '/css/images/m2.png';
                            p = 66;
                            p1 = 65;
                            p2 = 33;
                            p3 = 35;
                        } else if (size < 50) {
                            img = ctxContent + '/css/images/m1.png';
                            p = 56;
                            p1 = 55;
                            p2 = 28;
                            p3 = 29;
                        }
                        style = new ol.style.Style({
                            image: new ol.style.Icon({
                                offset: [0, 0],
                                opacity: 1.0,
                                rotateWithView: true,
                                rotation: 0.0,
                                scale: 1.0,
                                size: [p, p1],
                                anchor: [p2, p3],
                                anchorXUnits: 'pixels',
                                anchorYUnits: 'pixels',
                                src: img,
                            }),
                            text: new ol.style.Text({
                                text: size.toString(),
                                font: '14px Arial',
                                fill: new ol.style.Fill({
                                    color: '#000',
                                }),
                            }),
                        });
                        styleCache[size] = style;
                    }
                }
            }
            break;
        case 'singleAlarm':
            // var key=name.get('features')[0].getProperties()["ZDZQID"];
            var status = name.getProperties()['ZQZT'];
            var type = name.getProperties()['ZQLXDM'];
            var alarmType = '';
            switch (type) {
                case '10000':
                    {
                        alarmType = '火灾扑救';
                    }
                    break;
                case '20000':
                    {
                        alarmType = '抢险救援';
                    }
                    break;
                case '30000':
                    {
                        alarmType = '反恐排爆';
                    }
                    break;
                case '40000':
                    {
                        alarmType = '公务执勤';
                    }
                    break;
                case '50000':
                    {
                        alarmType = '社会救助';
                    }
                    break;
                case '60000':
                    {
                        alarmType = '其他救援';
                    }
                    break;
                case '70000':
                    {
                        alarmType = '演练测试';
                    }
                    break;
            }

            style = new ol.style.Style({
                image: new ol.style.Icon({
                    anchor: [0.5, 24],
                    anchorXUnits: 'fraction',
                    anchorYUnits: 'pixels',
                    opacity: 1,
                    scale: 1,
                    src:
                        ctxContent + '/css/images/alarm/' + alarmType + (status == 12 ? '-已结案' : '-未结案') + '.png',
                    imgSize: [32, 32],
                }),
            });
            break;
        case 'sortIcon':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [17, 32],
                        anchorXUnits: 'pixels',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/sortIcon_' + name + '.png',
                        //               size:[32,32],
                        imgSize: [48, 48],
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgb(82,91,250,0.5)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgb(144,89,21,0.8)',
                        width: 2,
                    }),
                });
            }
            break;
        case 'terminal':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 0.5],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        opacity: 1,
                        src: ctxContent + '/css/images/终端.png',
                        //               size:[32,32],
                        imgSize: [32, 32],
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 0, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 0, 0,0.6)',
                        width: 2,
                    }),
                });
            }
            break;
        case 'passRoute':
            {
                style = [
                    new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: '#959595',
                            width: 8,
                        }),
                        zIndex: 1000,
                    }),
                    new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: '#b5b5b5',
                            width: 6,
                        }),
                        zIndex: 1001,
                    }),
                ];
            }
            break;
        case 'trackRouteArrow':
            if (!routeColor[routeColorIndex]) {
                routeColorIndex = 0;
            }
            var styleColor = routeColor[routeColorIndex];
            style = function (feature, resolution) {
                var geometry = feature.getGeometry();
                //var length = geometry.getCoordinates().length;
                var length = geometry.getLength();
                var zindex = name + 3;
                var styles = [
                    // linestring
                    new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: '#154f3b',
                            width: 10,
                        }),
                        zIndex: zindex,
                    }),
                    new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: styleColor.lineColor,
                            width: 8,
                        }),
                        zIndex: zindex + 1,
                    }),
                ];
                //var j = 0.1;
                var arr = [];
                resolution = PS.map.getView().getResolution();
                var step_length = 60 * resolution;
                //var totalCount = length>=20?Math.floor(length/2) : 10
                var totalCount = parseInt(length / step_length);
                var j = 1 / totalCount;
                for (var i = 0; i < totalCount; i++) {
                    var coords = geometry.getCoordinateAt(j * i);
                    arr.push(coords);
                }
                geometry.forEachSegment(function (start, end) {
                    var dx = end[0] - start[0];
                    var dy = end[1] - start[1];
                    var rotation = Math.atan2(dy, dx);
                    //针对箭头所在的线段调整箭头角度
                    var line = new ol.geom.LineString([start, end]);
                    for (var i = 0; i < arr.length; i++) {
                        if (line.intersectsExtent([arr[i][0], arr[i][1], arr[i][0], arr[i][1]])) {
                            styles.push(
                                new ol.style.Style({
                                    geometry: new ol.geom.Point(arr[i]),
                                    image: new ol.style.Icon({
                                        src: ctxContent + '/css/images/arrow.png',
                                        anchor: [0.75, 0.5],
                                        rotateWithView: true,
                                        rotation: -rotation,
                                    }),
                                    zIndex: zindex + 2,
                                })
                            );
                        }
                    }
                });
                return styles;
            };
            break;
        case 'YztHightLight':
            {
                let textStyle = '';
                if (name) {
                    textStyle = new ol.style.Text({
                        text: ' ' + name + ' ',
                        offsetY: -20,
                        offsetX: 20,
                        font: 'bold 28px MicrosoftYaHei',
                        // backgroundFill:new ol.style.Fill({
                        //     color : '#fff',
                        //     stroke : new ol.style.Stroke({
                        //         color : '#fff',
                        //         width : 1
                        //     })
                        // }),
                        fill: new ol.style.Fill({
                            color: '#800040',
                            stroke: new ol.style.Stroke({
                                color: '#ffffff',
                                width: 8,
                            }),
                        }),
                        stroke: new ol.style.Stroke({
                            color: '#ffffff',
                            width: 5,
                        }),
                        // backgroundFill:new ol.style.Fill({
                        //     color:'#9722B4'
                        // })
                    });
                }
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: 'rgba(25,28,238,0.5)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgb(139,108,32,0.8)',
                        width: 2,
                    }),
                    image: new ol.style.Icon({
                        anchor: [0.5, 0.5],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        opacity: 1,
                        src: ctxContent + '/css/images/终端.png',
                        //               size:[32,32],
                        imgSize: [32, 32],
                    }),
                });
                style.setText(textStyle);
            }
            break;
        case 'addLocation':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 0.85],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        opacity: 1,
                        scale: 0.8,
                        src: ctxContent + '/css/images/addLocation.png',
                        // size:[32,32],
                        imgSize: [48, 48],
                    }),
                });
            }
            break;
        case 'addLocation1':
            {
                style = function (feature, resolution) {
                    let fid = feature.getId().split('.')[0];
                    let imgSrc = '';
                    let attr = feature.getProperties();
                    if (fid == 'view_lake') {
                        imgSrc = ctxContent + '/css/images/water/lake.png';
                    } else {
                        imgSrc = ctxContent + '/css/images/water/river.png';
                        if (attr.warn_level < attr.water_level) {
                            imgSrc = ctxContent + '/css/images/water/river_super.png';
                        }
                    }
                    var functionStyle = new ol.style.Style({
                        image: new ol.style.Icon({
                            anchor: [0.5, 0.85],
                            anchorXUnits: 'fraction',
                            anchorYUnits: 'fraction',
                            opacity: 1,
                            scale: 0.8,
                            src: imgSrc,
                            // size:[32,32],
                            imgSize: [48, 48],
                        }),
                    });
                    return functionStyle;
                };
            }
            break;
        case 'water':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 0.5],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        opacity: 1,
                        src: ctxContent + '/css/images/water/river.png',
                        imgSize: [32, 32],
                    }),
                });
            }
            break;

        case 'person':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 0.85],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        opacity: 1,
                        scale: 0.8,
                        src: ctxContent + '/css/images/addLocation.png',
                        // size:[32,32],
                        imgSize: [48, 48],
                    }),
                });
            }
            break;
        case 'routebuffer':
            {
                style = new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: 'rgba(0,78,255,0.3)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: '#004eff',
                        width: 1,
                    }),
                });
            }
            break;
        case 'ministation':
            {
                let textStyle = '';
                if (name) {
                    textStyle = new ol.style.Text({
                        text: ' ' + name + ' ',
                        offsetY: -30,
                        offsetX: 0,
                        font: 'bold 14px MicrosoftYaHei',
                        backgroundFill: new ol.style.Fill({
                            color: '#920783',
                            stroke: new ol.style.Stroke({
                                color: '#920783',
                                width: 1,
                            }),
                        }),
                        fill: new ol.style.Fill({
                            color: '#fff',
                            stroke: new ol.style.Stroke({
                                color: '#fff',
                                width: 5,
                            }),
                        }),
                    });
                }
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 32],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/ministation.png',
                        scale: 0.6,
                        imgSize: [48, 48],
                    }),
                });
                style.setText(textStyle);
            }
            break;
        case 'xczhbgps':
            {
                let textStyle = '';
                if (name) {
                    textStyle = new ol.style.Text({
                        text: ' ' + name + ' ',
                        offsetY: -30,
                        offsetX: 0,
                        font: 'bold 14px MicrosoftYaHei',
                        backgroundFill: new ol.style.Fill({
                            color: '#EF4545',
                            stroke: new ol.style.Stroke({
                                color: '#EF4545',
                                width: 1,
                            }),
                        }),
                        fill: new ol.style.Fill({
                            color: '#fff',
                            stroke: new ol.style.Stroke({
                                color: '#fff',
                                width: 5,
                            }),
                        }),
                    });
                }
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 32],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/xczhb.png',
                        scale: 0.6,
                        imgSize: [48, 48],
                    }),
                });
                style.setText(textStyle);
            }
            break;
        case 'address':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 32],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'pixels',
                        opacity: 1,
                        src: ctxContent + '/css/images/address.png',
                        scale: 0.6,
                        imgSize: [48, 48],
                    }),
                });
            }
            break;
        case 'spjkd':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 0.5],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        opacity: 1,
                        scale: 0.8,
                        src: ctxContent + '/css/images/jksp.png',
                        imgSize: [48, 48],
                    }),
                });
            }
            break;
        case 'playVideo':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 0.5],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        opacity: 1,
                        scale: 0.8,
                        src: ctxContent + '/css/images/playvideo.png',
                        imgSize: [48, 48],
                    }),
                });
            }
            break;
        case 'uav':
            {
                style = new ol.style.Style({
                    image: new ol.style.Icon({
                        anchor: [0.5, 0.5],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                        opacity: 1,
                        src: ctxContent + '/css/images/uav.png',
                        //               size:[32,32],
                        imgSize: [48, 48],
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 0, 0, 0.1)',
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 0, 0,0.6)',
                        width: 2,
                    }),
                });
            }
            break;
    }
    return style;
}

/**
 * 获取定位类型图标
 * @param type
 * @returns {ol.style.Style}
 */
function getDWLXStyle(type)
{
    let styleName=getLocationType(type);
    let style = new ol.style.Style({
        image: new ol.style.Icon(
            ({
                anchor: [0.5, 0.85],
                anchorXUnits: 'fraction',
                anchorYUnits: 'fraction',
                opacity: 1,
                scale: 0.6,
                src: ctxContent + '/css/images/dw/'+type+'.png',
                // size:[32,32],
                imgSize: [53, 64]
            })),
            text: new ol.style.Text({
                text: ' ' + styleName + ' ',
                offsetY: 18,
                font: 'bold 14px sans-serif',
                backgroundFill: new ol.style.Fill({
                    color: '#9f9f9f',
                    stroke: new ol.style.Stroke({
                        color: '#9f9f9f',
                        width: 1,
                    }),
                }),
                fill: new ol.style.Fill({
                    color: '#fff',
                    stroke: new ol.style.Stroke({
                        color: '#fff',
                        width: 5,
                    }),
                }),
            }),

    })
    return style;
}


/***
 * 获取矢量图片缩放比例
 * @returns {number}
 */
function getImgFactor() {
    var zoom = PS.map.getView().getZoom();
    var factor;
    if (zoom > 10) {
        factor = 0.1 * (zoom - 10);
    } else {
        factor = 0.01 * zoom;
    }
    return factor;
}

/**
 * 通过点击事件获取地图上要素
 * @param _e 地图点击事件
 *
 */
var filterTypeList = ['view_zqxx_heatmap', 'view_zqxx_statisticbycity', 'mhjy_syjbxx_icemap'];
function getFeatureByEvent(mode, _e, data) {
    if (!mode) {
        return;
    }
    let allSelectedFeatures = [];
    localPopupFeatures = [];
    let feature = mode.map.forEachFeatureAtPixel(_e.pixel, function (feature, layer) {
        if (
            feature.getId() === 'PS_start' ||
            feature.getId() === 'PS_end' ||
            feature.getId() === 'start' ||
            feature.getId() === 'end'
        ) {
            return;
        }
        if (feature.getGeometry().getType() == 'Point') {
            if (feature.getId()) {
                var LyrType = feature.getId().split('.')[0];
                if (LyrType === 'user_defined_poi') {
                    cleanPopup(mode);
                    window.getFeatureInfo_poi(feature);
                }
            }
            if (feature.getProperties().features) {
                allSelectedFeatures = allSelectedFeatures.concat(feature.getProperties().features);
            } else {
                allSelectedFeatures.push(feature);
            }
            let overlay = feature.get('overlay');
            if (overlay) {
                overlay.setMap(mode.map);
                // 实时车辆跟踪功能的车辆详情弹窗绑定关闭按钮事件受创建overlay异步的影响，绑定会失败，调整为打开弹窗时重新绑定事件 -- lyk 20240702
                $('#popup-closer').click(function (e) {
                    var id = e.target.attributes.carid.value;
                    var overlay = mode.map.getOverlayById(id + '_passRoute');
                    if (overlay) {
                        overlay.setMap(null);
                        GPSTrack.closeVideoplay(id);
                    }
                });
            } else {
                return feature;
            }
        } else {
            var features = feature.getProperties().features; //聚合图层
            if (features && features.length > 0) {
                feature = features[0];
            }
            if(feature.getProperties().type == 'populationPlot'){
                showDeleteBtn(mode,feature);
                return;
            }
            var fid = feature.getId();
            if (!fid) {
                console.log('没有可供展示的');
                return;
            } else {
                var type = fid.split('.')[0];
                if (type === 'zdab_layer_feature') {
                    cleanPopup(mode);
                    window.getFeatureInfo(feature);
                } else {
                    return;
                }
            }
        }
    });

    let geomType = feature ? feature.getGeometry().getType() : null; // 空间对象类型的判断
    if (mode.name == 'AJ' && geomType == 'Polygon') {
        Pie.piePopup(mode, feature);
    }
    // if (feature == undefined || geomType != "Point") {
    let layerListParams = getVisibleWmsLayer(mode);
    if (layerListParams[0].length < 1) {
        //没有可见wms图层时，判断选中矢量要素个数
        if (allSelectedFeatures.length == 1) {
            //屏蔽结束
            if (parent.window.anaysisPopup) {
                parent.anaysisPopup(mode, allSelectedFeatures[0]);
            } else {
                popup(mode, allSelectedFeatures[0], data);
            }
        } else if (allSelectedFeatures.length > 1) {
            if (parent.window.anaysisPopup) {
                parent.anaysisPopup(mode, allSelectedFeatures);
            }
        }
        return;
    }
    let viewResolution = mode.map.getView().getResolution();
    let url = layerListParams[0][0]
        .getSource()
        .getGetFeatureInfoUrl(_e.coordinate, viewResolution, mode.map.getView().getProjection(), {
            INFO_FORMAT: 'application/json',
            FEATURE_COUNT: 20,
        });
    let urlString = getWmsInfoUrl(mode, url, layerListParams, _e.coordinate);
    if (urlString.indexOf('&STYLES=heatmap') > -1) {
        //热力图pop
        urlString = urlString.replace('&STYLES=heatmap', '&STYLES=');
    }
    if (urlString.indexOf('&STYLES=icemap') > -1) {
        //冰点pop
        urlString = urlString.replace('&STYLES=icemap', '&STYLES=');
    }
    let urlPararms = urlString.split('?');
    url = urlPararms[0];
    let params = decodeURIComponent(urlPararms[1]); //查doc的时候用docPoint去查
    params = encodeURI(
        params.replace(new RegExp('gis:docPoint', 'g'), 'gis:doc').replace(new RegExp('gis:doc', 'g'), 'gis:docPoint')
    );
    if (url) {
        $.ajax({
            url: url,
            type: 'post',
            contentType: 'application/x-www-form-urlencoded',
            data: params,
            async: true,
            success: function (result) {
                // //这里的处理是针对我们用的doc包含了线和点，用的GeometryCollection，readFeatures无法解析出点，只能解析出线的geom，
                // // 下面的replace是为了将用的GeometryCollection的点转换成point单点的json//现在采用另一种方式，查doc的时候用docPoint去查
                // let key1 = '"geometries":\\[{';
                // let key2 = '"type":"GeometryCollection",';
                // let key3 = '\]}\]},"geometry_name"';
                // result = JSON.stringify(result);
                // result=result.replace(new RegExp(key1,'g'),"").replace(new RegExp(key2,'g'),"").replace(new RegExp(key3,'g'),"]},\"geometry_name\"");
                // result = JSON.parse(result);

                let format = new ol.format.GeoJSON();
                let features = [];
                if (result.features && result.features.length > 0) {
                    features = format.readFeatures(result, {
                        dataProject: MAPCONFIG.projection.getCode(),
                        featureProjection: MAPCONFIG.projection.getCode(),
                    });
                }
                //过滤不显示popup的图层开始，取feature下一个作为pop
                let flag = false;
                let currentFeature = null;
                features = clearRepeatFeature(features, allSelectedFeatures);
                if (!features || features.length == 0) {
                    return;
                }
                if (parent.window.anaysisPopup && features.length > 1) {
                    parent.anaysisPopup(mode, features);
                    return;
                }
                for (let i = 0; i < features.length; i++) {
                    currentFeature = null;
                    currentFeature = setFeatureType(features[i]);
                    let typeName = currentFeature.get('type');
                    if (filterTypeList.indexOf(typeName) < 0) {
                        //过滤不显示popup的图层，取下一个feature
                        flag = true;
                        break;
                    }
                }
                if (!flag) {
                    //flag为 false则点击的位置 过滤后 没有可以显示的feature
                    return;
                }
                //屏蔽结束
                if (parent.window.anaysisPopup) {
                    parent.anaysisPopup(mode, currentFeature);
                } else {
                    popup(mode, currentFeature, data);
                }
            },
            error: function (result) {
                console.log(result);
            },
        });
    }
    if (feature == undefined) {
        return;
    }
    // }

    if (
        parent.window.anaysisPopup &&
        feature.getProperties() &&
        feature.getProperties().features &&
        feature.getProperties().features.length > 1 &&
        feature.get('type') != 'kld'
    ) {
        parent.anaysisPopup(mode, feature.getProperties().features);
        return;
    }

    if (
        parent.window.anaysisPopup &&
        feature.get('type') != 'kld' &&
        (!feature.getId() || feature.getId().indexOf('river') < 0)
    ) {
        parent.anaysisPopup(mode, feature);
    } else {
        popup(mode, feature, data);
    }
}

function cleanPopupForDRAW(mode) {
    mode.overlay_P.setMap(null);
    mode.overlay.setMap(null);
    mode.baseRoute.getSource().updateParams({
        VIEWPARAMS: 'X1:0;Y1:0;X2:0;Y2:0',
    });
}

// 清理重复要素：尤其是序号要素
function clearRepeatFeature(fs, fs_new) {
    // 获取 fs 和 fs_new 中的所有 ID
    let fsIds = fs.map(f => f.getId());
    let fsNewIds = fs_new.map(f => f.getId());

    // 去重 fs_new 中 ID 为 fs 中 ID 字符串追加 '_new' 的要素
    let filteredFsNew = fs_new.filter(f => {
        let id = f.getId();
        if (id) {
            let baseId = id.replace('_new', '');
            return !fsIds.includes(baseId);
        }
    });

    // 合并两个要素数组
    let combinedFeatures = fs.concat(filteredFsNew);
    return combinedFeatures;
}

/**
 * 矢量要素编辑
 *
 * params type 编辑类型
 * features 编辑的要素
 * layer 编辑的图层
 *
 */
function modifyWfs(modename, type, features, layer,callback) {
    if (layer != 'gis:b_poi') {
        if (modename === 'PS') {
            cleanPopupForDRAW(PS);
        } else {
            cleanPopupForDRAW(DRAW);
        }
        // PS?cleanPopupForDRAW(PS):cleanPopupForDRAW(DRAW);//清除弹窗
    }
    var WFSTSerializer = new ol.format.WFS();
    var xmlformat;
    var params = layer.split(':');
    var geoNs = 'http://www.telewave.com.cn/gis';
    switch (type) {
        case 'insert': //新增
            {
                xmlformat = WFSTSerializer.writeTransaction(features, null, null, {
                    featureNS: geoNs, //命名空间URL
                    featurePrefix: params[0], //工作区名称
                    featureType: params[1], //图层名称
                    srsName: 'EPSG:4326',
                });
            }
            break;
        case 'update': //修改
            {
                xmlformat = WFSTSerializer.writeTransaction(null, features, null, {
                    featureNS: geoNs,
                    featurePrefix: params[0],
                    featureType: params[1],
                    srsName: 'EPSG:4326',
                });
            }
            break;
        case 'delete': //删除
            {
                xmlformat = WFSTSerializer.writeTransaction(null, null, features, {
                    featureNS: geoNs,
                    featurePrefix: params[0],
                    featureType: params[1],
                    srsName: 'EPSG:4326',
                });
            }
            break;
    }

    var serializer = new XMLSerializer();
    var featString = serializer.serializeToString(xmlformat);
    $.ajax({
        type: 'POST',
        url: MAPCONFIG.wfsURL,
        data: featString,
        contentType: 'text/xml',
        success: function (data) {
            var result = WFSTSerializer.readTransactionResponse(data);
            if(result.insertIds?.length >0 && callback){
                callback(result.insertIds[0])
            }
            if (result.transactionSummary) {
                var summary = result.transactionSummary;
                if (summary.totalDeleted > 0) {
                    // alert("总共一条记录被删除！");
                    $.jBox.messager('总共一条记录被删除！', '提示', 5000, {
                        width: 300,
                        height: 120,
                        icon: 'success',
                        showType: 'show',
                        // buttons: { '确定': true },
                        submit: function (v, h, f) {
                            return true;
                        },
                    });
                } else if (summary.totalInserted > 0) {
                    // alert("总共一条记录被新增！")
                    $.jBox.messager('总共一条记录被新增！', '提示', 5000, {
                        width: 300,
                        height: 120,
                        icon: 'success',
                        showType: 'show',
                        // buttons: { '确定': true },
                        submit: function (v, h, f) {
                            return true;
                        },
                    });
                } else if (summary.totalUpdated > 0) {
                    $.jBox.messager('总共一条记录被修改！', '提示', 5000, {
                        width: 300,
                        height: 120,
                        icon: 'success',
                        showType: 'show',
                        // buttons: { '确定': true,'取消':false},
                        submit: function (v, h, f) {
                            return true;
                        },
                    });
                }
            }
            if (layer != 'gis:b_poi') {
                disableFeatureEdit(DRAW);
            }
        },
        error: function (e) {
            var errorMsg = e ? e.status + ' ' + e.statusText : '';
            alert('Error saving this feature to GeoServer.<br><br>' + errorMsg);
        },
        context: this,
    });
}

/**
 * WKT格式数据展示
 *
 * data 加载数据
 *
 */
function loadWKTfeature(data) {
    if (!data) {
        return;
    }
    if (typeof data == 'string') {
        PS.heightLightLayer.getSource().clear();
        data = data.toLowerCase(); //字符串先转小写
        var geometry = wktFormat.readGeometry(data).transform('EPSG:4326', MAPCONFIG.projection);
        var feature = new ol.Feature({
            geometry: geometry,
            type: 'temp',
        });
        if (data.indexOf('point') > -1) {
            feature.setStyle(getStyle('sortIcon', '1'));
        } else {
            feature.setStyle(getStyle('greenCircle'));
        }
        zoomToFeatureOld(PS, feature); //缩放到指定要素
        PS.heightLightLayer.getSource().addFeature(feature);
        PS.heightLightLayer.setVisible(true);
    } else {
    }
}

/**
 * 计算两点之间的距离
 *
 * p1 起点
 * p2 终点
 *
 */
function getDistance(p1, p2) {
    var wgs84Sphere = new ol.Sphere(6378137);
    var from = [Number(p1[0]), Number(p1[1])];
    var to = [Number(p2[0]), Number(p2[1])];
    var distance = wgs84Sphere.haversineDistance(from, to);
    return Math.round(distance);
}

/**
 * 更新警情最新信息
 *
 * data 警情最新信息
 *
 */
function updateAlarmLocate(data, mode) {
    var feature = PS.baseClusterSource.getFeatureById('zhdd_zqxx.' + data.jjdid);
    if (feature) {
        var geom = new ol.geom.Point([Number(data.gisx), Number(data.gisy)]).transform(
            'EPSG:4326',
            MAPCONFIG.projection.getCode()
        );
        if (data.zhdd) {
            feature.setProperties({ address: data.zhdd });
            feature.setProperties({ zhdd: data.zhdd });
        }
        feature.setGeometry(geom);
        clearCircleSearch(mode);
        var coordinate = geom.getCoordinates();
        mode.overlay.setPosition(coordinate);
        mode.overlay_P.setPosition(coordinate);
    }
}

/**
 * 删除json数据
 * @param data
 */
function deleteJsonFeature(data) {
    var feature = jsonFormat.readFeature(data);
    modifyWfs('PS', 'delete', [feature], 'gis:b_traffic_line');
}
