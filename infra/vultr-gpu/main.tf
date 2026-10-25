data "vultr_plan" "gpu" {
  filter {
    name   = "id"
    values = [var.gpu_plan_id]
  }
}

resource "vultr_firewall_group" "gpu" {
  description = "${var.instance_label}: SSH only; inference stays on loopback"
}

resource "vultr_firewall_rule" "ssh" {
  for_each = toset(var.ssh_allowed_ipv4_cidrs)

  firewall_group_id = vultr_firewall_group.gpu.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = cidrhost(each.value, 0)
  subnet_size       = tonumber(split("/", each.value)[1])
  port              = "22"
  notes             = "SSH from ${each.value}"
}

resource "vultr_instance" "gpu" {
  region            = var.region
  plan              = var.gpu_plan_id
  os_id             = var.os_id
  label             = var.instance_label
  hostname          = var.instance_label
  tags              = ["prvsa", "gpu", "ephemeral"]
  firewall_group_id = vultr_firewall_group.gpu.id
  ssh_key_ids       = var.ssh_key_ids
  user_scheme       = "limited"
  enable_ipv6       = var.enable_ipv6
  backups           = "disabled"
  ddos_protection   = false
  activation_email  = false

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    api_port                = var.api_port
    app_git_ref             = var.app_git_ref
    app_repository_url      = var.app_repository_url
    classification_enabled  = var.deploy_classification_model
    classification_image    = var.embedding_image
    classification_model_id = var.classification_model_id
    classification_port     = var.classification_port
    embedding_image         = var.embedding_image
    embedding_model_id      = var.embedding_model_id
    embedding_port          = var.embedding_port
  })

  lifecycle {
    precondition {
      condition     = startswith(var.gpu_plan_id, "vcg-") || try(data.vultr_plan.gpu.gpu_vram, 0) > 0
      error_message = "Choose a Vultr Cloud GPU plan (normally a vcg-* plan or a plan that reports GPU VRAM)."
    }

    precondition {
      condition     = contains(try(data.vultr_plan.gpu.locations, []), var.region)
      error_message = "The selected GPU plan is not offered in this region. Check Vultr region availability."
    }

    precondition {
      condition     = try(data.vultr_plan.gpu.monthly_cost, var.max_monthly_cost + 1) <= var.max_monthly_cost
      error_message = "The selected plan exceeds max_monthly_cost. Increase the ceiling only after checking the price."
    }

    precondition {
      condition     = length(toset([var.api_port, var.embedding_port, var.classification_port])) == 3
      error_message = "api_port, embedding_port, and classification_port must be different."
    }
  }

  depends_on = [vultr_firewall_rule.ssh]
}
