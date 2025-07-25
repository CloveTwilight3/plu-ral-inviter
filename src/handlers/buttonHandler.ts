import { ButtonInteraction, EmbedBuilder, GuildMember } from 'discord.js';
import { ROLES } from '../config/roles.js';
import { database } from '../database/database.js';

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith('approve_proxy_') && !interaction.customId.startsWith('deny_proxy_')) {
    return;
  }

  // Check if user has mod role
  const member = interaction.member as GuildMember;
  if (!interaction.memberPermissions?.has('Administrator') && 
      !member?.roles.cache.has(ROLES.mod)) {
    await interaction.reply({
      content: 'You do not have permission to use this button.',
      flags: 64 // ephemeral flag
    });
    return;
  }

  const isApproval = interaction.customId.startsWith('approve_proxy_');
  const proxyId = interaction.customId.split('_')[2];

  // Get pending request from database
  const pendingRequest = await database.getPendingRequest(interaction.message.id);
  if (!pendingRequest) {
    await interaction.reply({
      content: 'This request is no longer valid or has already been processed.',
      flags: 64 // ephemeral flag
    });
    return;
  }

  const { user_id: userId, requested_roles: rolesData } = pendingRequest;
  
  // Handle roles data - it might already be parsed by MySQL
  let requestedRoles;
  try {
    console.log('Raw roles data:', rolesData);
    console.log('Type of rolesData:', typeof rolesData);
    
    if (typeof rolesData === 'string') {
      requestedRoles = JSON.parse(rolesData);
    } else {
      // Already an object
      requestedRoles = rolesData;
    }
    
    console.log('Parsed roles:', requestedRoles);
  } catch (error) {
    console.error('Error processing requested roles:', error);
    await interaction.reply({
      content: '❌ Error processing role data. Please contact an administrator.',
      flags: 64 // ephemeral flag
    });
    return;
  }

  if (isApproval) {
    // Try to find the proxy user (bot) in the guild
    const guild = interaction.guild!;
    let proxyMember = guild.members.cache.get(proxyId);
    
    // If not in cache, try to fetch it
    if (!proxyMember) {
      try {
        console.log(`Attempting to fetch bot member ${proxyId}`);
        proxyMember = await guild.members.fetch(proxyId);
        console.log(`Successfully fetched bot member: ${proxyMember.user.username}`);
      } catch (error) {
        console.error(`Failed to fetch bot member ${proxyId}:`, error);
      }
    }
    
    if (!proxyMember) {
      await interaction.reply({
        content: `❌ Could not find proxy bot with ID ${proxyId}. Please make sure:\n\n1. The bot has been invited to the server using the OAuth URL\n2. The bot has successfully joined the server\n3. Wait a few moments and try again\n\n**Note:** This is a bot user, not a regular user. It must be properly invited through Discord's OAuth system.`,
        flags: 64 // ephemeral flag
      });
      return;
    }

    // Verify it's actually a bot
    if (!proxyMember.user.bot) {
      await interaction.reply({
        content: `❌ User ${proxyMember.user.username} (${proxyId}) is not a bot. Proxy users must be bots.`,
        flags: 64 // ephemeral flag
      });
      return;
    }

    try {
      // Assign required roles first
      const rolesToAdd: string[] = [...ROLES.required];

      // Add requested roles with proper type checking
      if (requestedRoles.color && typeof requestedRoles.color === 'string' && requestedRoles.color in ROLES.colors) {
        rolesToAdd.push(ROLES.colors[requestedRoles.color as keyof typeof ROLES.colors]);
      }
      if (requestedRoles.age && typeof requestedRoles.age === 'string' && requestedRoles.age in ROLES.ages) {
        rolesToAdd.push(ROLES.ages[requestedRoles.age as keyof typeof ROLES.ages]);
      }
      if (requestedRoles.pronouns && typeof requestedRoles.pronouns === 'string' && requestedRoles.pronouns in ROLES.pronouns) {
        rolesToAdd.push(ROLES.pronouns[requestedRoles.pronouns as keyof typeof ROLES.pronouns]);
      }

      // Add access roles
      for (const [accessType, hasAccess] of Object.entries(requestedRoles)) {
        if (hasAccess && accessType in ROLES.access) {
          rolesToAdd.push(ROLES.access[accessType as keyof typeof ROLES.access]);
        }
      }

      console.log('Roles to add to bot:', rolesToAdd);

      // Assign roles to the bot
      await proxyMember.roles.add(rolesToAdd);
      console.log(`Successfully assigned roles to bot: ${proxyMember.user.username}`);

      // Save user-proxy relationship
      await database.saveUserProxy(userId, proxyId);

      // Update embed to show approval
      const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x57F287)
        .setTitle('✅ Userproxy Request Approved')
        .addFields(
          { name: 'Approved by', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Bot User', value: `${proxyMember.user.username}#${proxyMember.user.discriminator}`, inline: true }
        );

      await interaction.update({
        embeds: [approvedEmbed],
        components: []
      });

      // Notify the original requester
      try {
        const requester = await interaction.client.users.fetch(userId);
        await requester.send(`✅ Your userproxy request for bot **${proxyMember.user.username}** has been approved and roles have been assigned!`);
      } catch (error) {
        console.log('Could not DM user about approval');
      }

    } catch (error) {
      console.error('Error assigning roles to bot:', error);
      await interaction.reply({
        content: `❌ An error occurred while assigning roles to the bot. This might be due to:\n\n1. Permission issues (bot hierarchy)\n2. Invalid role IDs\n3. Bot-specific restrictions\n\nError: ${error}\n\nPlease assign roles manually.`,
        flags: 64 // ephemeral flag
      });
      return;
    }
  } else {
    // Denial
    const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0xED4245)
      .setTitle('❌ Userproxy Request Denied')
      .addFields({ name: 'Denied by', value: `<@${interaction.user.id}>`, inline: true });

    await interaction.update({
      embeds: [deniedEmbed],
      components: []
    });

    // Notify the original requester
    try {
      const requester = await interaction.client.users.fetch(userId);
      await requester.send('❌ Your userproxy request has been denied by a moderator.');
    } catch (error) {
      console.log('Could not DM user about denial');
    }
  }

  // Clean up pending request
  await database.deletePendingRequest(interaction.message.id);
}