/** 최소 아이콘 세트 (16px, 1.5 선). 외부 아이콘 라이브러리 없이 필요한 것만. */
import type { ReactNode } from "react";

const Icon = ({ children, label }: { children: ReactNode; label: string }) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    role="img"
    aria-label={label}
  >
    <title>{label}</title>
    {children}
  </svg>
);

export const PlayIcon = () => (
  <Icon label="실행">
    <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon label="일시정지">
    <path d="M5.5 3.5v9M10.5 3.5v9" />
  </Icon>
);

export const ResetIcon = () => (
  <Icon label="처음으로">
    <path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2M3.5 3v2.5H6" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon label="추가">
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const RotateIcon = () => (
  <Icon label="회전">
    <path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2M12.5 3v2.5H10" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon label="삭제">
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
  </Icon>
);

export const CodeIcon = () => (
  <Icon label="코드">
    <path d="M6 4.5 2.5 8 6 11.5M10 4.5 13.5 8 10 11.5" />
  </Icon>
);

export const ScopeIcon = () => (
  <Icon label="스코프">
    <path d="M2 11 5 6l2.5 4L10 4.5 14 9" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon label="닫기">
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);
