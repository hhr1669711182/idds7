import io
P = "herness/02-\u6280\u672f\u8bbe\u8ba1/\u524d\u7aef/Control\u8d70\u7ebf\u8fc1\u79fb\u6e05\u5355\u4e0e\u66ff\u6362\u65b9\u6848.md"
t = io.open(P, encoding="utf-8").read()
R = [
("| L4 | `Control/messageStageGate.ts:52` | `seat-shared-state` | \u9636\u6bb5\u95e8\u63a7\u7a33\u5b9a\u7a97\u53e3\u91cd\u7f6e | \u26a0\ufe0f \u53ef\u6539\u4e3a watch store\uff0c\u89c1 \u00a710.4 |",
 "| L4 | `Control/messageStageGate.ts:52` | `seat-shared-state` | \u9636\u6bb5\u95e8\u63a7\u7a33\u5b9a\u7a97\u53e3\u91cd\u7f6e | \u2705 \u6539 `watch(MapMode)`\uff0c\u7a97\u53e3\u903b\u8f91\u89c1 \u00a710.3.7 |"),
("| L5 | `Control/seatSharedState.ts:131`\uff08`whenDispatchTrack`\uff09 | `seat-shared-state` | \u7b49 `dispatchTrack` \u9636\u6bb5\u89e6\u53d1\u4e00\u6b21\u56de\u8c03 | \u26a0\ufe0f \u53ef\u6539\u4e3a watch store\uff0c\u89c1 \u00a710.4 |",
 "| L5 | `Control/seatSharedState.ts:131`\uff08`whenDispatchTrack`\uff09 | `seat-shared-state` | \u7b49 `dispatchTrack` \u9636\u6bb5\u89e6\u53d1\u4e00\u6b21\u56de\u8c03 | \u2705 \u6539 `watch(MapMode)`\uff0c\u89c1 \u00a710.3.5 |"),
("| L6 | `Control/pageCondition.ts:115`\uff08`initPageConditionListener`\uff09 | `seat-shared-state` + `ids-gis:page-condition` | phase \u53d8\u5316 \u2192 \u5207\u9875\u7f16\u6392 | \u26a0\ufe0f \u524d\u534a\u53ef\u6539 watch\uff1b\u540e\u534a\u662f\u81ea\u6709\u952e\uff0c\u89c1 \u00a710.4 |",
 "| L6 | `Control/pageCondition.ts:115`\uff08`initPageConditionListener`\uff09 | `seat-shared-state` + `ids-gis:page-condition` | phase \u53d8\u5316 \u2192 \u5207\u9875\u7f16\u6392 | \u2705 \u524d\u534a\u6539 `watch(MapMode)`\uff1b\u540e\u534a\u81ea\u6709\u952e\u4fdd\u7559\uff0c\u89c1 \u00a710.3.5 |"),
("| L7 | `Control/incidentLocationProfileSync.ts:161` | `seat-shared-state` | \u76d1\u542c `currentAlarm.incidentId` \u53d8\u5316\u62c9\u753b\u50cf | \u26a0\ufe0f \u53ef\u6539\u4e3a watch store\uff0c\u89c1 \u00a710.4 |",
 "| L7 | `Control/incidentLocationProfileSync.ts:161` | `seat-shared-state` | \u76d1\u542c `currentAlarm.incidentId` \u53d8\u5316\u62c9\u753b\u50cf | \u2705 \u6539 `watch(currentAlarm?.incidentId)`\uff0c\u89c1 \u00a710.3.4 |"),
("| L8 | `Control/incidentLocationMessage.ts:390` | `seat-shared-state` | slotChanges \u7f13\u5b58\u6309\u9636\u6bb5\u6e05\u7a7a | \u26a0\ufe0f \u53ef\u6539\u4e3a watch store\uff0c\u89c1 \u00a710.4 |",
 "| L8 | `Control/incidentLocationMessage.ts:390` | `seat-shared-state` | slotChanges \u7f13\u5b58\u6309\u9636\u6bb5\u6e05\u7a7a | \u2705 \u6539 `watch(MapMode)`\uff0c\u89c1 \u00a710.3.5 |"),
("| L9 | `controller/core/io/InputController.ts:126` | `seat-shared-state` | \u56de\u503c\u5b88\u6e05\u6765\u7535\u7c97\u5b9a\u4f4d | \u26a0\ufe0f \u53ef\u6539\u4e3a watch store\uff0c\u89c1 \u00a710.4 |",
 "| L9 | `controller/core/io/InputController.ts:126` | `seat-shared-state` | \u56de\u503c\u5b88\u6e05\u6765\u7535\u7c97\u5b9a\u4f4d | \u2705 \u6539 `watch(MapMode)`\uff0c\u89c1 \u00a710.3.5 / \u00a710.3.7 |"),
("| L10 | `utils/storage.ts:181`\uff08`subscribe`\uff09 | \u547d\u540d\u7a7a\u95f4\u5316 key\uff08`app:*`\uff09 | \u901a\u7528\u8de8\u6807\u7b7e\u9875\u8ba2\u9605\u5de5\u5177 | \u2705 \u4fdd\u7559\uff08\u4e0e\u672c\u8bae\u9898\u6b63\u4ea4\uff09 |",
 "| L10 | `utils/storage.ts:181`\uff08`subscribe`\uff09 | \u547d\u540d\u7a7a\u95f4\u5316 key\uff08`app:*`\uff09 | \u901a\u7528\u8de8\u6807\u7b7e\u9875\u8ba2\u9605\u5de5\u5177 | \u2705 \u4fdd\u7559\uff08\u4e0e\u672c\u8bae\u9898\u6b63\u4ea4\uff09 |\n| **L11**\uff08\u65b0\u589e\uff09 | `router/index.ts:155,168` | `seat-shared-state`\uff08**\u76f4\u8bfb\u800c\u975e\u542c**\uff09 | \u5237\u65b0\u6062\u590d\u62e6\u622a | \u2705 \u6539\u8bfb `useUserStore().MapMode`\uff0c\u89c1 \u00a710.3.5 |"),
]
miss = []
for a, b in R:
    if a in t: t = t.replace(a, b, 1)
    else: miss.append(a[:46])
io.open(P, "w", encoding="utf-8", newline="").write(t)
print("MISSED:", miss if miss else "none")