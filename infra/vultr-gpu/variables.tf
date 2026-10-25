variable "vultr_api_key" {
  description = "Vultr API key. Set it through TF_VAR_vultr_api_key; never commit it to a tfvars file."
  type        = string
  sensitive   = true
}

variable "region" {
  description = "Vultr region ID that offers the selected GPU plan, for example ewr or ord."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.region))
    error_message = "region must be a Vultr region ID containing lowercase letters, digits, or hyphens."
  }
}

variable "gpu_plan_id" {
  description = "Vultr Cloud GPU plan ID. Check region availability before applying."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._-]+$", var.gpu_plan_id))
    error_message = "gpu_plan_id contains unsupported characters."
  }
}

variable "os_id" {
  description = "Vultr OS ID. The default is the Vultr Ubuntu 24.04 LTS x64 image used in its GPU Terraform example."
  type        = number
  default     = 2284
}

variable "ssh_key_ids" {
  description = "IDs of existing Vultr SSH keys to install on the instance."
  type        = list(string)

  validation {
    condition     = length(var.ssh_key_ids) > 0 && alltrue([for id in var.ssh_key_ids : length(trimspace(id)) > 0])
    error_message = "Provide at least one non-empty Vultr SSH key ID."
  }
}

variable "ssh_allowed_ipv4_cidrs" {
  description = "IPv4 CIDRs allowed to SSH to the worker. Prefer your current public IP with /32."
  type        = list(string)

  validation {
    condition = length(var.ssh_allowed_ipv4_cidrs) > 0 && alltrue([
      for cidr in var.ssh_allowed_ipv4_cidrs :
      can(cidrnetmask(cidr)) && can(regex("^[0-9.]+/[0-9]+$", cidr))
    ])
    error_message = "Provide at least one valid IPv4 CIDR, such as 203.0.113.10/32."
  }
}

variable "instance_label" {
  description = "Label and hostname for the GPU worker."
  type        = string
  default     = "prvsa-gpu"

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", var.instance_label))
    error_message = "instance_label must be a valid lowercase hostname of at most 63 characters."
  }
}

variable "embedding_model_id" {
  description = "Public Hugging Face model ID served by Text Embeddings Inference."
  type        = string
  default     = "Qwen/Qwen3-Embedding-0.6B"

  validation {
    condition     = can(regex("^[A-Za-z0-9._/-]+$", var.embedding_model_id))
    error_message = "embedding_model_id contains unsupported characters."
  }
}

variable "embedding_image" {
  description = "Text Embeddings Inference CUDA image. Override this to match the selected GPU architecture when necessary."
  type        = string
  default     = "ghcr.io/huggingface/text-embeddings-inference:cuda-1.9"

  validation {
    condition     = can(regex("^[A-Za-z0-9._/@:-]+$", var.embedding_image))
    error_message = "embedding_image contains unsupported characters."
  }
}

variable "embedding_port" {
  description = "Loopback port used by the embedding server on the worker."
  type        = number
  default     = 8080

  validation {
    condition     = var.embedding_port >= 1024 && var.embedding_port <= 65535
    error_message = "embedding_port must be between 1024 and 65535."
  }
}

variable "deploy_classification_model" {
  description = "Deploy a second lightweight TEI service for text classification."
  type        = bool
  default     = true
}

variable "classification_model_id" {
  description = "Hugging Face sequence-classification model served by the optional second TEI process."
  type        = string
  default     = "SamLowe/roberta-base-go_emotions"

  validation {
    condition     = can(regex("^[A-Za-z0-9._/-]+$", var.classification_model_id))
    error_message = "classification_model_id contains unsupported characters."
  }
}

variable "classification_port" {
  description = "Loopback diagnostics port for the optional classification service."
  type        = number
  default     = 8081

  validation {
    condition     = var.classification_port >= 1024 && var.classification_port <= 65535
    error_message = "classification_port must be between 1024 and 65535."
  }
}

variable "api_port" {
  description = "Loopback port used by the deployed FastAPI application."
  type        = number
  default     = 8000

  validation {
    condition     = var.api_port >= 1024 && var.api_port <= 65535
    error_message = "api_port must be between 1024 and 65535."
  }
}

variable "app_repository_url" {
  description = "Public Git repository cloned on the worker to build the FastAPI image."
  type        = string
  default     = "https://github.com/NateMartes/HackPSU.git"

  validation {
    condition     = can(regex("^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\\.git)?$", var.app_repository_url))
    error_message = "app_repository_url must be an HTTPS GitHub repository URL."
  }
}

variable "app_git_ref" {
  description = "Public branch or tag cloned to build the FastAPI image."
  type        = string
  default     = "main"

  validation {
    condition     = can(regex("^[A-Za-z0-9._/-]+$", var.app_git_ref)) && !strcontains(var.app_git_ref, "..")
    error_message = "app_git_ref must be a safe Git branch or tag name."
  }
}

variable "max_monthly_cost" {
  description = "Safety ceiling for the plan's published monthly price. Apply fails above this amount."
  type        = number
  default     = 400

  validation {
    condition     = var.max_monthly_cost > 0
    error_message = "max_monthly_cost must be greater than zero."
  }
}

variable "enable_ipv6" {
  description = "Enable IPv6 on the worker."
  type        = bool
  default     = true
}
