<?xml version="1.0" encoding="UTF-8"?>
<sld:StyledLayerDescriptor xmlns="http://www.opengis.net/sld"
                          xmlns:sld="http://www.opengis.net/sld"
                          xmlns:gml="http://www.opengis.net/gml"
                          xmlns:ogc="http://www.opengis.net/ogc"
                          version="1.0.0">

  <sld:UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>ssrk_population_linear</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Name>population_density_linear</sld:Name>
        <sld:FeatureTypeName>Feature</sld:FeatureTypeName>

        <!-- 线性颜色渐变规则 -->
        <sld:Rule>
          <sld:Name>population_gradient</sld:Name>

          <!-- 填充: 蓝色(0) → 青色(250) → 绿色(500) → 黄色(750) → 红色(1000) -->
          <sld:PolygonSymbolizer>
            <sld:Fill>
              <sld:CssParameter name="fill">
                <ogc:Function name="Interpolate">
                  <!-- 输入属性 -->
                  <ogc:PropertyName>met_population</ogc:PropertyName>
                  <!-- 插值方法: color -->
                  <ogc:Literal>color</ogc:Literal>
                  <!-- 映射值和颜色 (5个节点实现线性渐变) -->
                  <ogc:Literal>0</ogc:Literal>
                  <ogc:Literal>#0000FF</ogc:Literal>      <!-- 蓝色 -->
                  <ogc:Literal>250</ogc:Literal>
                  <ogc:Literal>#00FFFF</ogc:Literal>     <!-- 青色 -->
                  <ogc:Literal>500</ogc:Literal>
                  <ogc:Literal>#00FF00</ogc:Literal>     <!-- 绿色 -->
                  <ogc:Literal>750</ogc:Literal>
                  <ogc:Literal>#FFFF00</ogc:Literal>     <!-- 黄色 -->
                  <ogc:Literal>1000</ogc:Literal>
                  <ogc:Literal>#FF0000</ogc:Literal>     <!-- 红色 -->
                  <!-- 插值模式: linear -->
                  <ogc:Literal>linear</ogc:Literal>
                </ogc:Function>
              </sld:CssParameter>
              <sld:CssParameter name="fill-opacity">0.4</sld:CssParameter>
            </sld:Fill>
            <sld:Stroke>
              <sld:CssParameter name="stroke">
                <ogc:Function name="Interpolate">
                  <ogc:PropertyName>met_population</ogc:PropertyName>
                  <ogc:Literal>color</ogc:Literal>
                  <ogc:Literal>0</ogc:Literal>
                  <ogc:Literal>#0000FF</ogc:Literal>
                  <ogc:Literal>250</ogc:Literal>
                  <ogc:Literal>#00FFFF</ogc:Literal>
                  <ogc:Literal>500</ogc:Literal>
                  <ogc:Literal>#00FF00</ogc:Literal>
                  <ogc:Literal>750</ogc:Literal>
                  <ogc:Literal>#FFFF00</ogc:Literal>
                  <ogc:Literal>1000</ogc:Literal>
                  <ogc:Literal>#FF0000</ogc:Literal>
                  <ogc:Literal>linear</ogc:Literal>
                </ogc:Function>
              </sld:CssParameter>
              <sld:CssParameter name="stroke-width">2</sld:CssParameter>
              <sld:CssParameter name="stroke-opacity">1</sld:CssParameter>
              <sld:CssParameter name="stroke-linejoin">bevel</sld:CssParameter>
            </sld:Stroke>
          </sld:PolygonSymbolizer>

          <!-- 文字标签: 显示区域名称 + 人口数量 -->
          <sld:TextSymbolizer>
            <sld:Label>
              <ogc:Function name="Concatenate">
                <ogc:PropertyName>zone_name</ogc:PropertyName>
                <ogc:Literal> (</ogc:Literal>
                <ogc:PropertyName>met_population</ogc:PropertyName>
                <ogc:Literal>)</ogc:Literal>
              </ogc:Function>
            </sld:Label>
            <sld:Font>
              <sld:CssParameter name="font-family">微软雅黑</sld:CssParameter>
              <sld:CssParameter name="font-size">14</sld:CssParameter>
              <sld:CssParameter name="font-style">normal</sld:CssParameter>
              <sld:CssParameter name="font-weight">bold</sld:CssParameter>
            </sld:Font>
            <sld:LabelPlacement>
              <sld:PointPlacement>
                <sld:AnchorPoint>
                  <sld:AnchorPointX>0.5</sld:AnchorPointX>
                  <sld:AnchorPointY>0.5</sld:AnchorPointY>
                </sld:AnchorPoint>
              </sld:PointPlacement>
            </sld:LabelPlacement>
            <sld:Halo>
              <sld:Radius>2</sld:Radius>
              <sld:Fill>
                <sld:CssParameter name="fill">#FFFFFF</sld:CssParameter>
              </sld:Fill>
            </sld:Halo>
            <sld:Fill>
              <sld:CssParameter name="fill">#333333</sld:CssParameter>
            </sld:Fill>
          </sld:TextSymbolizer>
        </sld:Rule>

      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:UserLayer>
</sld:StyledLayerDescriptor>
