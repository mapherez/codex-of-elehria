import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
import FloppyDiskIcon from 'phosphor-svelte/lib/FloppyDiskIcon';
import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';
import ClockCounterClockwiseIcon from 'phosphor-svelte/lib/ClockCounterClockwiseIcon';
import ArrowsOutCardinalIcon from 'phosphor-svelte/lib/ArrowsOutCardinalIcon';
import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
import FilePlusIcon from 'phosphor-svelte/lib/FilePlusIcon';
import ArchiveIcon from 'phosphor-svelte/lib/ArchiveIcon';
import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
import XIcon from 'phosphor-svelte/lib/XIcon';
import ListIcon from 'phosphor-svelte/lib/ListIcon';
import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
import ArrowsInLineVerticalIcon from 'phosphor-svelte/lib/ArrowsInLineVerticalIcon';
import ArrowsOutLineVerticalIcon from 'phosphor-svelte/lib/ArrowsOutLineVerticalIcon';
import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
import LinkSimpleIcon from 'phosphor-svelte/lib/LinkSimpleIcon';
import FileMagnifyingGlassIcon from 'phosphor-svelte/lib/FileMagnifyingGlassIcon';
import CodeIcon from 'phosphor-svelte/lib/CodeIcon';
import EyeIcon from 'phosphor-svelte/lib/EyeIcon';

export const icons = {
  edit: PencilSimpleIcon, save: FloppyDiskIcon, publish: UploadSimpleIcon, history: ClockCounterClockwiseIcon,
  move: ArrowsOutCardinalIcon, delete: TrashIcon, create: FilePlusIcon, deleted: ArchiveIcon,
  nox: ArrowsClockwiseIcon, cancel: XIcon, menu: ListIcon, left: CaretLeftIcon, right: CaretRightIcon,
  back: ArrowLeftIcon, settings: GearSixIcon, collapse: ArrowsInLineVerticalIcon, expand: ArrowsOutLineVerticalIcon,
  warning: WarningIcon, link: LinkSimpleIcon, unavailable: FileMagnifyingGlassIcon, markdown: CodeIcon, rendered: EyeIcon
};
export type IconName = keyof typeof icons;
