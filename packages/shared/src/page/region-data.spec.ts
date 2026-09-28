/**
 * 行政区划数据守卫单测 — 三层数据完整性 + level 收窄行为。
 */

import { describe, expect, it } from 'vitest';
import { REGION_TREE } from './region-data-full.js';
import { REGION_PROVINCES, regionOptions } from './region-data.js';

describe('REGION_TREE 三层数据', () => {
  it('覆盖 34 个省级行政区，与 REGION_PROVINCES 一致', () => {
    expect(Object.keys(REGION_TREE).length).toBe(34);
    expect(Object.keys(REGION_TREE)).toEqual(REGION_PROVINCES);
  });

  it('总量在民政部口径合理范围（市级 300+，县级 3000+）', () => {
    const cities = Object.values(REGION_TREE).flatMap((c) => Object.keys(c));
    const counties = Object.values(REGION_TREE)
      .flatMap((c) => Object.values(c))
      .flat();
    expect(cities.length).toBeGreaterThanOrEqual(330);
    expect(counties.length).toBeGreaterThanOrEqual(3000);
  });

  it('广东省→深圳市→南山区 链路存在', () => {
    expect(REGION_TREE['广东省']?.['深圳市']).toContain('南山区');
  });

  it('北京市规范化为 北京市→北京市→16区（无「市辖区」占位）', () => {
    const bj = REGION_TREE['北京市'];
    expect(Object.keys(bj ?? {})).toEqual(['北京市']);
    expect(bj?.['北京市']?.length).toBe(16);
    expect(bj?.['北京市']).toContain('东城区');
  });

  it('港澳台在列：香港三区组、澳门半岛/氹仔/路环、台湾 22 县市', () => {
    expect(Object.keys(REGION_TREE['香港特别行政区'] ?? {}).sort()).toEqual([
      '九龙',
      '新界',
      '香港岛',
    ]);
    expect(Object.keys(REGION_TREE['澳门特别行政区'] ?? {})).toEqual(['澳门半岛', '氹仔', '路环']);
    expect(Object.keys(REGION_TREE['台湾省'] ?? {}).length).toBe(22);
  });

  it('所有值为字符串且无空名', () => {
    for (const cities of Object.values(REGION_TREE)) {
      for (const [city, counties] of Object.entries(cities)) {
        expect(city).toBeTruthy();
        for (const county of counties) expect(county).toBeTruthy();
      }
    }
  });
});

describe('regionOptions(level) 展示层级', () => {
  it('默认（区县级）产出三层链路 广东省→深圳市→南山区', () => {
    const options = regionOptions();
    const gd = options.find((o) => o.value === '广东省');
    const sz = gd?.children?.find((o) => o.value === '深圳市');
    expect(sz?.children?.some((o) => o.value === '南山区')).toBe(true);
  });

  it('province 级只产省名叶子', () => {
    const options = regionOptions('province');
    expect(options.length).toBe(34);
    expect(options[0]).toEqual({ label: '北京市', value: '北京市' });
    expect(options[0]?.children).toBeUndefined();
  });

  it('city 级止步于市名叶子', () => {
    const options = regionOptions('city');
    const gd = options.find((o) => o.value === '广东省');
    const sz = gd?.children?.find((o) => o.value === '深圳市');
    expect(sz).toEqual({ label: '深圳市', value: '深圳市' });
  });
});
