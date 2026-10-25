output "public_ip" {
  description = "Public IPv4 address of the GPU worker."
  value       = vultr_instance.gpu.main_ip
}

output "gpu" {
  description = "GPU metadata reported by the selected Vultr plan."
  value = {
    type                 = data.vultr_plan.gpu.gpu_type
    vram_gb              = data.vultr_plan.gpu.gpu_vram
    plan_id              = var.gpu_plan_id
    region               = var.region
    embedding_model      = var.embedding_model_id
    classification_model = var.deploy_classification_model ? var.classification_model_id : null
    image                = var.embedding_image
  }
}

output "estimated_cost" {
  description = "Published plan price and an approximate hourly equivalent. Actual Vultr billing governs."
  value = {
    monthly_usd            = data.vultr_plan.gpu.monthly_cost
    approximate_hourly_usd = tonumber(format("%.3f", data.vultr_plan.gpu.monthly_cost / 730))
  }
}

output "ssh_command" {
  description = "Connect using Vultr's limited-user account."
  value       = "ssh linuxuser@${vultr_instance.gpu.main_ip}"
}

output "embedding_tunnel_command" {
  description = "Open a local tunnel to the private embeddings service. Keep this command running."
  value       = "ssh -N -L ${var.embedding_port}:127.0.0.1:${var.embedding_port} linuxuser@${vultr_instance.gpu.main_ip}"
}

output "api_tunnel_command" {
  description = "Expose the remote FastAPI and TEI diagnostics ports on local loopback."
  value       = "ssh -N -L ${var.api_port}:127.0.0.1:${var.api_port} -L ${var.embedding_port}:127.0.0.1:${var.embedding_port} linuxuser@${vultr_instance.gpu.main_ip}"
}

output "api_url_after_tunnel" {
  description = "FastAPI base URL available locally while the SSH tunnel is open."
  value       = "http://127.0.0.1:${var.api_port}"
}

output "embedding_url_after_tunnel" {
  description = "TEI base URL available locally while the SSH tunnel is open."
  value       = "http://127.0.0.1:${var.embedding_port}"
}
