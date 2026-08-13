<!--
 * @Author: hhr
 * @Date: 2026-08-13 10:19:40
 * @LastEditTime: 2026-08-13 11:18:12
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\layout\MainLayout.vue
-->
<template>
  <div class="common-layout h-full bg-gray-50/50">
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </router-view>
    
    <!-- <bottomNav /> -->
  </div>
</template>
<script setup lang="ts">
</script>

