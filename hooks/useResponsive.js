import { useWindowDimensions } from 'react-native';

// Единая точка входа для всех решений об адаптивной раскладке в приложении.
// Живо отслеживает размер И ориентацию экрана (не разовая проверка при
// запуске) — складные устройства (Samsung Z Flip и т.п.) и поворот экрана
// подхватываются на лету, без перезапуска приложения.
//
// Пороги ширины:
//   isNarrow — телефон (портретная ориентация, самый частый случай)
//   isMedium — планшет портретно / развёрнутый складной телефон портретно
//   isWide   — планшет альбомно (текущая, изначальная раскладка приложения)
//
// Порог 600 совпадает с уже существовавшим isPhone в Настройках — не меняем
// его, чтобы не расходиться с уже проверенным местом.
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const isPortrait = height >= width;
  const isLandscape = !isPortrait;

  const isNarrow = width < 600;
  const isMedium = width >= 600 && width < 900;
  const isWide = width >= 900;

  // Этап 1: навигация — снизу в портретной ориентации, сбоку в альбомной.
  const navPosition = isPortrait ? 'bottom' : 'side';

  // Этап 3: карточки/модалки как единый выезжающий слой — снизу почти
  // везде, и только на действительно широком экране может уезжать сбоку.
  const sheetPosition = isWide ? 'side' : 'bottom';

  // Этап 2: показывать раздел как отдельный полноэкранный переход
  // (а не как встроенную двухколоночную панель) — теперь всегда true,
  // оставлено полем на будущее на случай, если решим вернуть разницу.
  const useFullScreenSections = true;

  return {
    width, height,
    isPortrait, isLandscape,
    isNarrow, isMedium, isWide,
    navPosition, sheetPosition,
    useFullScreenSections,
  };
}
