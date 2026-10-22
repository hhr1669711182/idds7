files = [
    r'src\views\markDraw\index.vue',
    r'src\baseComponent\OpenlayersMap\dispatchMap.vue',
    r'src\components\map\component\Panels\analyseMap.vue',
    r'src\components\map\component\Panels\animationMap.vue',
    r'src\components\map\component\baseSource.vue',
    r'src\composables\Swiper\Swiper.ts',
    r'src\Control\Swiper.ts',
    r'src\views\modelAssess\components\MiniMap.vue',
]
keywords = ['AMAP_LAYER', 'baseSource', 'createBaseSource', 'AMapLayer', 'amapLayer',
            'TileLayer', 'setSource', 'baseLayer', 'baseSourceStore', 'useBaseSourceStore',
            'new Map(', 'AMAP', 'amap']
for p in files:
    print(f'\n===== {p} =====')
    try:
        with open(p, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
        print(f'TOTAL: {len(lines)}')
        for i, l in enumerate(lines, 1):
            if any(k in l for k in keywords):
                print(f'{i}: {l.rstrip()}')
    except Exception as e:
        print(f'ERR: {e}')
