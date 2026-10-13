/**
 * 开发中心首页应用 CRUD mutations（从 DevCenterHome 拆出，单文件 400 行规范）。
 * 语义沿用原 AppList：创建后进工作台 / 删除与归档带确认（确认在页面层 Modal.confirm）。
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp, type FormInstance } from 'antd';
import { useNavigate } from 'react-router-dom';
import { qk } from '@apaas/shared/stores';
import { appsApi, type AppSummary, type CreateAppRequest } from '../../api/apps.js';
import { errMsg } from './home-bits.js';
import type { CreateFormValues } from '../app-list/constants.js';

interface UseAppCrudParams {
  form: FormInstance<CreateFormValues>;
  moveForm: FormInstance<{ group: string }>;
  setCreateOpen: (open: boolean) => void;
  setEditingApp: (app: AppSummary | null) => void;
  setMovingApp: (app: AppSummary | null) => void;
}

export function useAppCrud({
  form,
  moveForm,
  setCreateOpen,
  setEditingApp,
  setMovingApp,
}: UseAppCrudParams) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();

  const refreshApps = () => queryClient.invalidateQueries({ queryKey: qk.apps() });

  const createMutation = useMutation({
    mutationFn: (data: CreateAppRequest) => appsApi.create(data),
    onSuccess: (app) => {
      message.success('应用创建成功');
      refreshApps();
      setCreateOpen(false);
      form.resetFields();
      if (app?.id) navigate(`/app/${app.id}/dashboard`);
    },
    onError: (err) => message.error(errMsg(err, '创建失败，请重试')),
  });

  const deleteMutation = useMutation({
    mutationFn: (appId: string) => appsApi.delete(appId),
    onSuccess: () => {
      message.success('应用已删除');
      refreshApps();
    },
    onError: (err) => message.error(errMsg(err, '删除失败，请重试'), 5),
  });

  const archiveMutation = useMutation({
    mutationFn: (appId: string) => appsApi.archive(appId),
    onSuccess: () => {
      message.success('应用已归档');
      refreshApps();
    },
    onError: (err) => message.error(errMsg(err, '归档失败，请重试'), 5),
  });

  const updateMutation = useMutation({
    mutationFn: ({ appId, data }: { appId: string; data: Partial<CreateAppRequest> }) =>
      appsApi.update(appId, data),
    onSuccess: () => {
      message.success('应用信息已更新');
      refreshApps();
      setEditingApp(null);
      form.resetFields();
    },
    onError: (err) => message.error(errMsg(err, '更新失败，请重试')),
  });

  const moveMutation = useMutation({
    mutationFn: ({ appId, group }: { appId: string; group?: string }) =>
      appsApi.update(appId, { group: group || undefined }),
    onSuccess: () => {
      message.success('应用已移动到新分组');
      refreshApps();
      setMovingApp(null);
      moveForm.resetFields();
    },
    onError: (err) => message.error(errMsg(err, '移动失败，请重试')),
  });

  return {
    createMutation,
    deleteMutation,
    archiveMutation,
    updateMutation,
    moveMutation,
    refreshApps,
  };
}
