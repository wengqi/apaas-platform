/**
 * 内置行政区划数据 — 省级清单 + 省→市→区县 三层级联选项。
 *
 * 市/县明细在 region-data-full.ts（民政部口径生成，含港澳台补齐）。
 * 对齐飞书「行政区划单选/多选」组件：默认三级（区县级），经 level 属性
 * 可收窄为省级/市级；亦可通过组件 options 覆盖。
 */

import { REGION_TREE } from './region-data-full.js';

export const REGION_PROVINCES: string[] = [
  '北京市',
  '天津市',
  '上海市',
  '重庆市',
  '河北省',
  '山西省',
  '辽宁省',
  '吉林省',
  '黑龙江省',
  '江苏省',
  '浙江省',
  '安徽省',
  '福建省',
  '江西省',
  '山东省',
  '河南省',
  '湖北省',
  '湖南省',
  '广东省',
  '海南省',
  '四川省',
  '贵州省',
  '云南省',
  '陕西省',
  '甘肃省',
  '青海省',
  '内蒙古自治区',
  '广西壮族自治区',
  '西藏自治区',
  '宁夏回族自治区',
  '新疆维吾尔自治区',
  '香港特别行政区',
  '澳门特别行政区',
  '台湾省',
];

/** 级联选项（children 递归）。 */
export interface RegionOption {
  label: string;
  value: string;
  children?: RegionOption[];
}

/** 行政区划展示层级：province 省 / city 市 / district 区县（默认）。 */
export type RegionLevel = 'province' | 'city' | 'district';

function leafOption(name: string): RegionOption {
  return { label: name, value: name };
}

function cityOptions(prov: string, level: RegionLevel): RegionOption[] {
  const cities = REGION_TREE[prov] ?? {};
  const names = Object.keys(cities);
  if (level === 'city' || names.length === 0) {
    // 市级止步；无下级的省（如无）直接产出叶子省
    return names.map(leafOption);
  }
  return names.map((city) => {
    const counties = cities[city] ?? [];
    return {
      label: city,
      value: city,
      children: counties.length ? counties.map(leafOption) : undefined,
    };
  });
}

/** 转为级联/树形通用选项结构（level 控制深度，默认到区县级）。 */
export function regionOptions(level: RegionLevel = 'district'): RegionOption[] {
  if (level === 'province') return REGION_PROVINCES.map(leafOption);
  return REGION_PROVINCES.map((prov) => {
    const children = cityOptions(prov, level);
    return {
      label: prov,
      value: prov,
      children: children.length ? children : undefined,
    };
  });
}
