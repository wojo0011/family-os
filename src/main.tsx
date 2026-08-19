import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installWeatherIconCompatibility } from './weatherIconCompatibility';
import { installThemeFavicon } from './themeFavicon';
import { installSpace3DLauncher } from './space3DLauncher';
import { installMidnight3DLauncher } from './midnight3DLauncher';
import { installNature3DLauncher } from './nature3DLauncher';
import { installSoft3DLauncher } from './soft3DLauncher';
import { installCaptureModalController } from './captureModalController';
import { installCalendarPlannerEnhancement } from './calendarPlannerEnhancement';
import { installHealthModuleEnhancement } from './healthModuleEnhancement';
import { installHealthNotificationEngine } from './healthNotificationEngine';
import { installMoneyModuleEnhancement } from './moneyModuleEnhancement';
import { installHomeModuleEnhancement } from './homeModuleEnhancement';
import { installVehicleModuleEnhancement } from './vehicleModuleEnhancement';
import { installPetModuleEnhancement } from './petModuleEnhancement';
import { installRecurrenceCaptureEnhancement } from './recurrenceCaptureEnhancement';
import { installRecurringCalendarEnhancement } from './recurringCalendarEnhancement';
import { installRecurringNotificationEnhancement } from './recurringNotificationEnhancement';
import { installRecurringTodayEnhancement } from './recurringTodayEnhancement';
import './styles.css';
import './enhancements.css';
import './weather.css';
import './captureModal.css';
import './captureRecords.css';
import './calendarPlanner.css';
import './healthModule.css';
import './healthModuleMount.css';
import './medicationAdherence.css';
import './moneyModule.css';
import './moneyModuleMount.css';
import './homeModule.css';
import './homeModuleMount.css';
import './vehicleModule.css';
import './vehicleModuleMount.css';
import './petModule.css';
import './petModuleMount.css';

// Recovery-first boot: the application shell stays lightweight. No Three.js,
// WebGL, planet textures, rover scene, city skyline, Nature or Soft scene starts here.
installWeatherIconCompatibility();
installThemeFavicon();
installSpace3DLauncher();
installMidnight3DLauncher();
installNature3DLauncher();
installSoft3DLauncher();
installCaptureModalController();
installRecurrenceCaptureEnhancement();
installCalendarPlannerEnhancement();
installRecurringCalendarEnhancement();
installRecurringTodayEnhancement();
installHealthModuleEnhancement();
installMoneyModuleEnhancement();
installHomeModuleEnhancement();
installVehicleModuleEnhancement();
installPetModuleEnhancement();
installHealthNotificationEngine();
installRecurringNotificationEnhancement();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Family OS root element is missing.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Dismiss the fail-open loader as soon as the React shell has painted twice.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('family-os:app-ready'));
  });
});
