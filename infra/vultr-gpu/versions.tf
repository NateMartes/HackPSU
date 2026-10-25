terraform {
  required_version = ">= 1.5.0"

  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "~> 2.33"
    }
  }
}

provider "vultr" {
  api_key     = var.vultr_api_key
  rate_limit  = 100
  retry_limit = 3
}
