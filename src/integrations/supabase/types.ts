export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_history: {
        Row: {
          action_type: string
          company_id: string
          created_at: string
          description: string
          entity_ids: string[]
          entity_type: string
          id: string
          reverted: boolean
          reverted_at: string | null
          reverted_by: string | null
          reverts_action_id: string | null
          snapshot_after: Json
          snapshot_before: Json
          user_id: string | null
          user_name: string
        }
        Insert: {
          action_type: string
          company_id: string
          created_at?: string
          description?: string
          entity_ids?: string[]
          entity_type: string
          id?: string
          reverted?: boolean
          reverted_at?: string | null
          reverted_by?: string | null
          reverts_action_id?: string | null
          snapshot_after?: Json
          snapshot_before?: Json
          user_id?: string | null
          user_name?: string
        }
        Update: {
          action_type?: string
          company_id?: string
          created_at?: string
          description?: string
          entity_ids?: string[]
          entity_type?: string
          id?: string
          reverted?: boolean
          reverted_at?: string | null
          reverted_by?: string | null
          reverts_action_id?: string | null
          snapshot_after?: Json
          snapshot_before?: Json
          user_id?: string | null
          user_name?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          id: string
          payload: Json | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          banco: string
          bandeira: string | null
          company_id: string
          conta_pagamento: string | null
          created_at: string
          deleted_at: string | null
          descricao: string | null
          dia_fechamento: number | null
          dia_vencimento: number | null
          id: string
          limite: number
          nome: string
          saldo_inicial: number
          tipo: string
          updated_at: string
        }
        Insert: {
          banco?: string
          bandeira?: string | null
          company_id: string
          conta_pagamento?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao?: string | null
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          limite?: number
          nome?: string
          saldo_inicial?: number
          tipo?: string
          updated_at?: string
        }
        Update: {
          banco?: string
          bandeira?: string | null
          company_id?: string
          conta_pagamento?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao?: string | null
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          limite?: number
          nome?: string
          saldo_inicial?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          bairro: string
          cep: string
          cidade: string
          cnh: string
          cnh_categoria: string
          cnh_pdf_name: string | null
          cnh_storage_path: string | null
          cnh_validade: string | null
          company_id: string
          complemento: string
          comprovante_endereco_name: string | null
          comprovante_endereco_storage_path: string | null
          cpf: string
          created_at: string
          deleted_at: string | null
          email: string
          emergencia_nome1: string
          emergencia_nome2: string
          emergencia_tel1: string
          emergencia_tel2: string
          estado: string
          id: string
          nome: string
          numero: string
          observacoes: string
          rua: string
          telefone: string
          updated_at: string
        }
        Insert: {
          bairro?: string
          cep?: string
          cidade?: string
          cnh?: string
          cnh_categoria?: string
          cnh_pdf_name?: string | null
          cnh_storage_path?: string | null
          cnh_validade?: string | null
          company_id: string
          complemento?: string
          comprovante_endereco_name?: string | null
          comprovante_endereco_storage_path?: string | null
          cpf?: string
          created_at?: string
          deleted_at?: string | null
          email?: string
          emergencia_nome1?: string
          emergencia_nome2?: string
          emergencia_tel1?: string
          emergencia_tel2?: string
          estado?: string
          id?: string
          nome?: string
          numero?: string
          observacoes?: string
          rua?: string
          telefone?: string
          updated_at?: string
        }
        Update: {
          bairro?: string
          cep?: string
          cidade?: string
          cnh?: string
          cnh_categoria?: string
          cnh_pdf_name?: string | null
          cnh_storage_path?: string | null
          cnh_validade?: string | null
          company_id?: string
          complemento?: string
          comprovante_endereco_name?: string | null
          comprovante_endereco_storage_path?: string | null
          cpf?: string
          created_at?: string
          deleted_at?: string | null
          email?: string
          emergencia_nome1?: string
          emergencia_nome2?: string
          emergencia_tel1?: string
          emergencia_tel2?: string
          estado?: string
          id?: string
          nome?: string
          numero?: string
          observacoes?: string
          rua?: string
          telefone?: string
          updated_at?: string
        }
        Relationships: []
      }
      collection_followups: {
        Row: {
          channel: string
          cliente_id: string | null
          company_id: string
          created_at: string
          entity_id: string
          escalated: boolean
          id: string
          message_snapshot: string
          module: string
          moto_id: string | null
          regularized_at: string | null
          sent_at: string
          sent_by: string | null
          stage_number: number
        }
        Insert: {
          channel: string
          cliente_id?: string | null
          company_id: string
          created_at?: string
          entity_id: string
          escalated?: boolean
          id?: string
          message_snapshot?: string
          module: string
          moto_id?: string | null
          regularized_at?: string | null
          sent_at?: string
          sent_by?: string | null
          stage_number: number
        }
        Update: {
          channel?: string
          cliente_id?: string | null
          company_id?: string
          created_at?: string
          entity_id?: string
          escalated?: boolean
          id?: string
          message_snapshot?: string
          module?: string
          moto_id?: string | null
          regularized_at?: string | null
          sent_at?: string
          sent_by?: string | null
          stage_number?: number
        }
        Relationships: []
      }
      collection_rules: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          module: string
          stages: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          module: string
          stages?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          module?: string
          stages?: Json
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          cnpj: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          cnpj?: string
          created_at?: string
          id: string
          nome?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_entries: {
        Row: {
          categoria: string
          classificacao_manual: boolean
          cliente_id: string | null
          cliente_nome: string | null
          company_id: string
          conta: string | null
          created_at: string
          data: string
          data_prevista: string | null
          deleted_at: string | null
          descricao: string
          despesa_fixa: boolean
          fixed_origin_id: string | null
          id: string
          ignorada: boolean
          moto_id: string | null
          natureza: string | null
          observacao: string | null
          pago: boolean
          placa: string | null
          recorrencia_por_periodo: number | null
          recorrencia_tipo: string | null
          recorrencia_vezes: number | null
          recorrente: boolean
          rental_id: string | null
          serie_id: string | null
          subcategoria: string | null
          tags: string[]
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          categoria?: string
          classificacao_manual?: boolean
          cliente_id?: string | null
          cliente_nome?: string | null
          company_id: string
          conta?: string | null
          created_at?: string
          data?: string
          data_prevista?: string | null
          deleted_at?: string | null
          descricao?: string
          despesa_fixa?: boolean
          fixed_origin_id?: string | null
          id?: string
          ignorada?: boolean
          moto_id?: string | null
          natureza?: string | null
          observacao?: string | null
          pago?: boolean
          placa?: string | null
          recorrencia_por_periodo?: number | null
          recorrencia_tipo?: string | null
          recorrencia_vezes?: number | null
          recorrente?: boolean
          rental_id?: string | null
          serie_id?: string | null
          subcategoria?: string | null
          tags?: string[]
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          categoria?: string
          classificacao_manual?: boolean
          cliente_id?: string | null
          cliente_nome?: string | null
          company_id?: string
          conta?: string | null
          created_at?: string
          data?: string
          data_prevista?: string | null
          deleted_at?: string | null
          descricao?: string
          despesa_fixa?: boolean
          fixed_origin_id?: string | null
          id?: string
          ignorada?: boolean
          moto_id?: string | null
          natureza?: string | null
          observacao?: string | null
          pago?: boolean
          placa?: string | null
          recorrencia_por_periodo?: number | null
          recorrencia_tipo?: string | null
          recorrencia_vezes?: number | null
          recorrente?: boolean
          rental_id?: string | null
          serie_id?: string | null
          subcategoria?: string | null
          tags?: string[]
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      fines: {
        Row: {
          cliente_id: string | null
          company_id: string
          created_at: string
          data_multa: string
          data_notificacao: string | null
          deleted_at: string | null
          descricao: string
          id: string
          moto_id: string
          rental_id: string | null
          responsavel: string
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          cliente_id?: string | null
          company_id: string
          created_at?: string
          data_multa?: string
          data_notificacao?: string | null
          deleted_at?: string | null
          descricao?: string
          id?: string
          moto_id?: string
          rental_id?: string | null
          responsavel?: string
          status?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          cliente_id?: string | null
          company_id?: string
          created_at?: string
          data_multa?: string
          data_notificacao?: string | null
          deleted_at?: string | null
          descricao?: string
          id?: string
          moto_id?: string
          rental_id?: string | null
          responsavel?: string
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      inspection_settings: {
        Row: {
          company_id: string
          created_at: string
          id: string
          interval_days: number
          updated_at: string
          warning_days: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          interval_days?: number
          updated_at?: string
          warning_days?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          interval_days?: number
          updated_at?: string
          warning_days?: number
        }
        Relationships: []
      }
      inspections: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          data: string
          deleted_at: string | null
          id: string
          km: number | null
          media: Json
          moto_id: string
          observacao: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          data?: string
          deleted_at?: string | null
          id?: string
          km?: number | null
          media?: Json
          moto_id: string
          observacao?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          deleted_at?: string | null
          id?: string
          km?: number | null
          media?: Json
          moto_id?: string
          observacao?: string
          updated_at?: string
        }
        Relationships: []
      }
      maintenance: {
        Row: {
          company_id: string
          created_at: string
          custo: number
          data: string
          deleted_at: string | null
          descricao: string
          fornecedor: string
          id: string
          km: number | null
          moto_id: string
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          custo?: number
          data?: string
          deleted_at?: string | null
          descricao?: string
          fornecedor?: string
          id?: string
          km?: number | null
          moto_id?: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          custo?: number
          data?: string
          deleted_at?: string | null
          descricao?: string
          fornecedor?: string
          id?: string
          km?: number | null
          moto_id?: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      motorcycles: {
        Row: {
          ano_fabricacao: number | null
          ano_modelo: number | null
          aplicativo: string
          chassi: string
          company_id: string
          cor: string
          created_at: string
          crlv_pdf_name: string | null
          crlv_storage_path: string | null
          data_compra: string | null
          data_fipe: string | null
          data_venda: string | null
          decisao: string | null
          deleted_at: string | null
          dia_vencimento: number | null
          forma_compra: string
          historico_oleo: Json
          id: string
          km_atual: number | null
          km_compra: number | null
          km_troca_oleo: number | null
          km_venda: number | null
          lucro_operacional: number | null
          modelo: string
          num_motor: string
          num_parcelas: number | null
          parcelas_pagas: number | null
          placa: string
          proprietario: string | null
          renavam: string
          status: string
          tipo: string
          ultima_troca_oleo: string | null
          ultima_vistoria: string | null
          updated_at: string
          valor_compra: number | null
          valor_entrada: number | null
          valor_fipe: number | null
          valor_parcela: number | null
          valor_venda: number | null
        }
        Insert: {
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          aplicativo?: string
          chassi?: string
          company_id: string
          cor?: string
          created_at?: string
          crlv_pdf_name?: string | null
          crlv_storage_path?: string | null
          data_compra?: string | null
          data_fipe?: string | null
          data_venda?: string | null
          decisao?: string | null
          deleted_at?: string | null
          dia_vencimento?: number | null
          forma_compra?: string
          historico_oleo?: Json
          id?: string
          km_atual?: number | null
          km_compra?: number | null
          km_troca_oleo?: number | null
          km_venda?: number | null
          lucro_operacional?: number | null
          modelo?: string
          num_motor?: string
          num_parcelas?: number | null
          parcelas_pagas?: number | null
          placa: string
          proprietario?: string | null
          renavam?: string
          status?: string
          tipo?: string
          ultima_troca_oleo?: string | null
          ultima_vistoria?: string | null
          updated_at?: string
          valor_compra?: number | null
          valor_entrada?: number | null
          valor_fipe?: number | null
          valor_parcela?: number | null
          valor_venda?: number | null
        }
        Update: {
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          aplicativo?: string
          chassi?: string
          company_id?: string
          cor?: string
          created_at?: string
          crlv_pdf_name?: string | null
          crlv_storage_path?: string | null
          data_compra?: string | null
          data_fipe?: string | null
          data_venda?: string | null
          decisao?: string | null
          deleted_at?: string | null
          dia_vencimento?: number | null
          forma_compra?: string
          historico_oleo?: Json
          id?: string
          km_atual?: number | null
          km_compra?: number | null
          km_troca_oleo?: number | null
          km_venda?: number | null
          lucro_operacional?: number | null
          modelo?: string
          num_motor?: string
          num_parcelas?: number | null
          parcelas_pagas?: number | null
          placa?: string
          proprietario?: string | null
          renavam?: string
          status?: string
          tipo?: string
          ultima_troca_oleo?: string | null
          ultima_vistoria?: string | null
          updated_at?: string
          valor_compra?: number | null
          valor_entrada?: number | null
          valor_fipe?: number | null
          valor_parcela?: number | null
          valor_venda?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rentals: {
        Row: {
          caucao_parcelado: boolean
          caucao_pendente: boolean
          checklist_devolucao: Json
          checklist_retirada: Json
          cliente_id: string
          company_id: string
          created_at: string
          data_fim: string | null
          data_fim_contrato: string | null
          data_inicio: string
          deleted_at: string | null
          frequencia_pagamento: string
          gerar_cobranca_caucao: boolean
          gerar_cobranca_pagamento: boolean
          hora_inicio: string
          id: string
          juros_atraso_mes: number
          km_fim: number | null
          km_inicio: number
          local_devolucao: string
          local_retirada: string
          moto_id: string
          multa_atraso: number
          nivel_combustivel: string
          numero: number
          observacoes: string
          parcelas_caucao: Json
          plano: string
          proximo_pagamento: string | null
          raio_circulacao: string
          seguro_terceiros: boolean
          status: string
          tempo_minimo_contrato: number | null
          updated_at: string
          valor_caucao: number
          valor_diario: number
          vendedor: string
        }
        Insert: {
          caucao_parcelado?: boolean
          caucao_pendente?: boolean
          checklist_devolucao?: Json
          checklist_retirada?: Json
          cliente_id?: string
          company_id: string
          created_at?: string
          data_fim?: string | null
          data_fim_contrato?: string | null
          data_inicio?: string
          deleted_at?: string | null
          frequencia_pagamento?: string
          gerar_cobranca_caucao?: boolean
          gerar_cobranca_pagamento?: boolean
          hora_inicio?: string
          id?: string
          juros_atraso_mes?: number
          km_fim?: number | null
          km_inicio?: number
          local_devolucao?: string
          local_retirada?: string
          moto_id?: string
          multa_atraso?: number
          nivel_combustivel?: string
          numero?: number
          observacoes?: string
          parcelas_caucao?: Json
          plano?: string
          proximo_pagamento?: string | null
          raio_circulacao?: string
          seguro_terceiros?: boolean
          status?: string
          tempo_minimo_contrato?: number | null
          updated_at?: string
          valor_caucao?: number
          valor_diario?: number
          vendedor?: string
        }
        Update: {
          caucao_parcelado?: boolean
          caucao_pendente?: boolean
          checklist_devolucao?: Json
          checklist_retirada?: Json
          cliente_id?: string
          company_id?: string
          created_at?: string
          data_fim?: string | null
          data_fim_contrato?: string | null
          data_inicio?: string
          deleted_at?: string | null
          frequencia_pagamento?: string
          gerar_cobranca_caucao?: boolean
          gerar_cobranca_pagamento?: boolean
          hora_inicio?: string
          id?: string
          juros_atraso_mes?: number
          km_fim?: number | null
          km_inicio?: number
          local_devolucao?: string
          local_retirada?: string
          moto_id?: string
          multa_atraso?: number
          nivel_combustivel?: string
          numero?: number
          observacoes?: string
          parcelas_caucao?: Json
          plano?: string
          proximo_pagamento?: string | null
          raio_circulacao?: string
          seguro_terceiros?: boolean
          status?: string
          tempo_minimo_contrato?: number | null
          updated_at?: string
          valor_caucao?: number
          valor_diario?: number
          vendedor?: string
        }
        Relationships: []
      }
      user_companies: {
        Row: {
          company_id: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_action_history: { Args: never; Returns: undefined }
      get_user_companies: { Args: { _user_id: string }; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operador" | "visualizador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operador", "visualizador"],
    },
  },
} as const
