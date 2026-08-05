<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { gsap } from "gsap";

const AUTO_CLOSE_DELAY_MS = 3000;

export type IncomingCallPayload = {
  caller: string;
  phone: string;
  location: string;
  level: string;
  time: string;
};

const props = defineProps<{
  visible: boolean;
  call: IncomingCallPayload | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "answer"): void;
  (e: "reject"): void;
}>();

const overlayRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const ringRef = ref<HTMLElement | null>(null);

let introTl: gsap.core.Timeline | null = null;
let ringTl: gsap.core.Timeline | null = null;
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

const clearAutoCloseTimer = () => {
  if (!autoCloseTimer) return;
  clearTimeout(autoCloseTimer);
  autoCloseTimer = null;
};

const stopAnimations = () => {
  introTl?.kill();
  ringTl?.kill();
  introTl = null;
  ringTl = null;
};

const startAutoCloseTimer = () => {
  clearAutoCloseTimer();
  autoCloseTimer = setTimeout(() => {
    emit("close");
  }, AUTO_CLOSE_DELAY_MS);
};

const playAnimations = async () => {
  await nextTick();
  if (!overlayRef.value || !panelRef.value || !ringRef.value) return;

  stopAnimations();

  introTl = gsap
    .timeline()
    .fromTo(
      overlayRef.value,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.18, ease: "power2.out" },
    )
    .fromTo(
      panelRef.value,
      { autoAlpha: 0, y: 34, scale: 0.92 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.36, ease: "back.out(1.7)" },
      "<",
    );

  ringTl = gsap
    .timeline({ repeat: -1, repeatDelay: 0.12 })
    .to(panelRef.value, {
      x: -7,
      rotate: -1.2,
      duration: 0.055,
      ease: "power1.inOut",
    })
    .to(panelRef.value, {
      x: 7,
      rotate: 1.2,
      duration: 0.055,
      ease: "power1.inOut",
    })
    .to(panelRef.value, {
      x: 0,
      rotate: 0,
      duration: 0.055,
      ease: "power1.inOut",
    })
    .to(
      ringRef.value,
      {
        "--call-accent": "#ffcf5a",
        boxShadow: "0 0 34px rgba(255, 207, 90, 0.75)",
        duration: 0.22,
        ease: "sine.inOut",
      },
      0,
    )
    .to(ringRef.value, {
      "--call-accent": "#ff4d5f",
      boxShadow: "0 0 34px rgba(255, 77, 95, 0.72)",
      duration: 0.22,
      ease: "sine.inOut",
    });
};

watch(
  () => [props.visible, props.call] as const,
  ([visible, call]) => {
    clearAutoCloseTimer();

    if (visible && call) {
      void playAnimations();
      startAutoCloseTimer();
    } else {
      stopAnimations();
    }
  },
);

onBeforeUnmount(() => {
  clearAutoCloseTimer();
  stopAnimations();
});
</script>

<template>
  <div v-if="visible && call" ref="overlayRef" class="incoming_call_mask">
    <section ref="panelRef" class="incoming_call_panel" role="dialog" aria-modal="true">
      <div ref="ringRef" class="incoming_call_ring">
        <span class="phone_icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1.3.4 2.6.6 4 .6.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C10.3 22 2 13.7 2 3.4 2 2.7 2.5 2.2 3.2 2.2h3.5c.7 0 1.2.5 1.2 1.2 0 1.4.2 2.7.6 4 .1.4 0 .9-.3 1.2l-1.6 2.2Z"
            />
          </svg>
        </span>
      </div>

      <div class="call_content">
        <div class="call_kicker">来电告警</div>
        <h2>{{ call.caller }}</h2>
        <p class="call_phone">{{ call.phone }}</p>
        <div class="call_meta">
          <span>{{ call.level }}</span>
          <span>{{ call.location }}</span>
          <span>{{ call.time }}</span>
        </div>
      </div>

      <!-- <div class="call_actions">
        <button class="call_btn reject" type="button" @click="emit('reject')">挂断</button>
        <button class="call_btn answer" type="button" @click="emit('answer')">接听</button>
      </div> -->
    </section>
  </div>
</template>

<style scoped>
.incoming_call_mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at center, rgba(255, 77, 95, 0.18), transparent 38%),
    rgba(4, 12, 24, 0.45);
  backdrop-filter: blur(3px);
  pointer-events: auto;
}

.incoming_call_panel {
  width: min(420px, calc(100vw - 32px));
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(15, 27, 44, 0.96), rgba(8, 18, 32, 0.96));
  box-shadow: 0 26px 60px rgba(0, 0, 0, 0.44);
  color: #fff;
  padding: 28px 26px 24px;
  text-align: center;
}

.incoming_call_ring {
  --call-accent: #ff4d5f;
  width: 86px;
  height: 86px;
  margin: 0 auto 18px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--call-accent) 24%, rgba(255, 255, 255, 0.08));
  border: 2px solid var(--call-accent);
}

.phone_icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--call-accent);
}

.phone_icon svg {
  width: 24px;
  height: 24px;
  fill: white;
}

.call_kicker {
  color: #ffcf5a;
  font-size: 13px;
  letter-spacing: 0.08em;
}

h2 {
  margin: 8px 0 6px;
  font-size: 28px;
  font-weight: 700;
}

.call_phone {
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 18px;
}

.call_meta {
  display: grid;
  gap: 8px;
  margin: 18px 0 24px;
  color: rgba(255, 255, 255, 0.86);
  font-size: 14px;
}

.call_actions {
  display: flex;
  justify-content: center;
  gap: 14px;
}

.call_btn {
  min-width: 118px;
  height: 42px;
  border: 0;
  border-radius: 6px;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.call_btn.reject {
  background: #ef4444;
}

.call_btn.answer {
  background: #16a34a;
}
</style>
