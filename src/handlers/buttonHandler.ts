import { ButtonInteraction, EmbedBuilder } from 'discord.js';
import { ROLES } from '../config/roles.js';
import { database } from '../database/database.js';

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith('approve_proxy_') && !interaction.customId.startsWith('deny_proxy_')) {
    return;
  }

  // Check if user has mod role
  if (!interaction.memberPermissions?.has('Administrator') && 
      !interaction.member?.roles.cache.has(ROLES.mod)) {
    await interaction.reply({
      content: 'You do not have permission to use this button.',
      ephemeral: true
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
      ephemeral: true
    });
    return;
  }

  const { user_id: userId, requested_roles: rolesJson } = pendingRequest;
  const requestedRoles = JSON.parse(rolesJson);

  if (isApproval) {
    // Try to find the proxy user in the guild
    const guild = interaction.guild!;
    const proxyMember = guild.members.cache.get(proxyId);
    
    if (!proxyMember) {
      await interaction.reply({
        content: `❌ Could not find proxy user with ID ${proxyId}. Make sure they have been added to the server first.`,
        ephemeral: true
      });
      return;
    }

    try {
      // Assign required roles first
      const rolesToAdd = [...ROLES.required];

      // Add requested roles
      if (requestedRoles.color && ROLES.colors[requestedRoles.color]) {
        rolesToAdd.push(ROLES.colors[requestedRoles.color]);
      }
      if (requestedRoles.age && ROLES.ages[requestedRoles.age]) {
        rolesToAdd.push(ROLES.ages[requestedRoles.age]);
      }
      if (requestedRoles.pronouns && ROLES.pronouns[requestedRoles.pronouns]) {
        rolesToAdd.push(ROLES.pronouns[requestedRoles.pronouns]);
      }

      // Add access roles
      for (const [accessType, hasAccess] of Object.entries(requestedRoles)) {
        if (hasAccess && ROLES.access[accessType as keyof typeof ROLES.access]) {
          rolesToAdd.push(ROLES.access[accessType as keyof typeof ROLES.access]);
        }
      }

      // Assign roles
      await proxyMember.roles.add(rolesToAdd);

      // Save user-proxy relationship
      await database.saveUserProxy(userId, proxyId);

      // Update embed to show approval
      const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x57F287)
        .setTitle('✅ Userproxy Request Approved')
        .addFields({ name: 'Approved by', value: `<@${interaction.user.id}>`, inline: true });

      await interaction.update({
        embeds: [approvedEmbed],
        components: []
      });

      // Notify the original requester
      try {
        const requester = await interaction.client.users.fetch(userId);
        await requester.send(`✅ Your userproxy request for ${proxyMember.user.username} has been approved and roles have been assigned!`);
      } catch (error) {
        console.log('Could not DM user about approval');
      }

    } catch (error) {
      console.error('Error assigning roles:', error);
      await interaction.reply({
        content: '❌ An error occurred while assigning roles. Please try again or assign them manually.',
        ephemeral: true
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