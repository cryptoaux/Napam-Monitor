terraform {
  backend "s3" {
    key     = "napams-monitor/production/terraform.tfstate"
    encrypt = true
  }
}