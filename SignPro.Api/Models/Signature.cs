using System.ComponentModel.DataAnnotations;

namespace SignPro.Api.Models;

public class Signature
{
    public int Id { get; set; }

    public int UserId { get; set; }

    [Required]
    public string SignatureImagePath { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}