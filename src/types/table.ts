import { TemplateResult } from "lit-element";

export type SortingDirection = "desc" | "asc" | null;

export interface DataTableColumnContainer {
  [key: string]: DataTableColumnData;
}

export interface DataTableSortColumnData {
  sortable?: boolean;
  filterable?: boolean;
  filterKey?: string;
  valueColumn?: string;
  direction?: SortingDirection;
}

export interface DataTableColumnData extends DataTableSortColumnData {
  title: TemplateResult | string;
  type?: "numeric" | "icon" | "icon-button" | "overflow-menu";
  template?: <T>(data: any, row: T) => TemplateResult | string;
  width?: string;
  maxWidth?: string;
  grows?: boolean;
  forceLTR?: boolean;
  hidden?: boolean;
}

export type ClonedDataTableColumnData = Omit<DataTableColumnData, "title"> & {
  title?: TemplateResult | string;
};

export interface DataTableRowData {
  [key: string]: any;
  selectable?: boolean;
}

export interface SortableColumnContainer {
  [key: string]: ClonedDataTableColumnData;
}
