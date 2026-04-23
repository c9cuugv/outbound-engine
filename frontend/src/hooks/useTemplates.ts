import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate } from "../api/templates";
import type { EmailTemplate } from "../types/campaign";

export const useTemplateList = () =>
  useQuery({ queryKey: ["templates"], queryFn: fetchTemplates });

export const useCreateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
};

export const useUpdateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<EmailTemplate> }) =>
      updateTemplate(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
};

export const useDeleteTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
};
