<template>
  <div class="common-layout h-full bg-gray-50/50">
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </router-view>
    
    <bottomNav />
  </div>
</template>
<script setup lang="ts">
</script>

