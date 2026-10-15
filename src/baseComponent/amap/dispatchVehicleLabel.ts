import Overlay from 'ol/Overlay';
import './dispatchVehicleLabel.css';

export type DispatchVehicleLabelData = {
  elapsed: string;
  eta: string;
  distance: string;
  expanded: boolean;
  vehicles: string[];
};

export const createDispatchVehicleLabel = (onToggle: () => void) => {
  const element = document.createElement('section');
  element.className = 'dispatch-vehicle-label';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'dispatch-vehicle-label__toggle';
  toggle.addEventListener('click', onToggle);
  const metrics = document.createElement('div');
  metrics.className = 'dispatch-vehicle-label__metrics';
  const rows = ['实际用时', '预计时间', '剩余距离'].map(() => document.createElement('div'));
  metrics.append(...rows);
  const list = document.createElement('div');
  list.className = 'dispatch-vehicle-label__vehicles';
  element.append(toggle, metrics, list);
  const overlay = new Overlay({
    element,
    positioning: 'bottom-center',
    offset: [0, -46],
    stopEvent: true,
  });
  let previousList = '';
  return {
    overlay,
    update(data: DispatchVehicleLabelData) {
      const texts = [`实际用时：${data.elapsed}`, `预计时间：${data.eta}`, `剩余距离：${data.distance} 千米`];
      rows.forEach((row, index) => {
        if (row.textContent !== texts[index]) row.textContent = texts[index];
      });
      toggle.hidden = !data.vehicles.length;
      toggle.textContent = data.expanded ? '收起 ⌃' : '详情 ⌄';
      toggle.setAttribute('aria-expanded', String(data.expanded));
      toggle.setAttribute('aria-label', data.expanded ? '收起车辆详情' : '展开车辆详情');
      list.hidden = !data.expanded || !data.vehicles.length;
      const signature = JSON.stringify(data.vehicles);
      if (signature !== previousList) {
        previousList = signature;
        list.replaceChildren(...data.vehicles.map((text) => {
          const row = document.createElement('div');
          row.textContent = text;
          return row;
        }));
      }
    },
  };
};
